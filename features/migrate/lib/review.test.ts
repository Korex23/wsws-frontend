import { describe, expect, it } from "vitest";
import { byVenue, defaultOptIn, reasonKey, reviewGroups } from "@/features/migrate/lib/review";
import type { LegacyHolding, Venue } from "@/lib/migration/types";

const NOW = 1_700_000_000_000;

function holding(id: string, venue: Venue, overrides: Partial<LegacyHolding> = {}): LegacyHolding {
  return {
    id,
    venue,
    kind: "x",
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 10,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
    ...overrides,
  };
}

describe("reviewGroups", () => {
  it("partitions holdings and totals only what will move", () => {
    const holdings = [
      holding("a", "wallet"),
      holding("b", "perps", { deterministic: false, kind: "position" }),
      holding("c", "perps", { deterministic: false, kind: "order", valueUsd: 5 }),
      holding("d", "cpmm", {
        settleability: { state: "waitUntil", at: NOW + 1, reason: "challengeWindow" },
      }),
      holding("e", "cpmm", {
        settleability: { state: "waitUntil", at: NOW - 1, reason: "challengeWindow" },
      }),
      holding("f", "wallet", {
        settleability: { state: "stranded", reason: "unsponsoredNetwork" },
      }),
      holding("g", "onramp", { settleability: { state: "pending", reason: "onramp" } }),
    ];
    const groups = reviewGroups(holdings, new Set(["c"]), NOW);

    expect(groups.automatic.map((h) => h.id)).toEqual(["a", "e"]);
    expect(groups.optIn.map((h) => h.id)).toEqual(["b", "c"]);
    expect(groups.later.map((h) => h.id)).toEqual(["d", "g"]);
    expect(groups.skipped.map((h) => h.id)).toEqual(["f"]);
    expect(groups.movingUsd).toBe(25);
  });
});

describe("defaultOptIn", () => {
  it("pre-checks perp orders only", () => {
    const holdings = [
      holding("order", "perps", { deterministic: false, kind: "order" }),
      holding("position", "perps", { deterministic: false, kind: "position" }),
      holding("shares", "polymarket", { deterministic: false, kind: "shares" }),
      holding("auto", "wallet"),
    ];
    expect([...defaultOptIn(holdings)]).toEqual(["order"]);
  });
});

describe("reasonKey", () => {
  it("names every non-moving state and nothing for a moving one", () => {
    expect(reasonKey({ state: "now" })).toBeNull();
    expect(reasonKey({ state: "waitUntil", at: null, reason: "awaitingResolution" })).toBe(
      "awaitingResolution"
    );
    expect(reasonKey({ state: "needsBackend", reason: "lockedBucket" })).toBe("lockedBucket");
    expect(reasonKey({ state: "stranded", reason: "noLiquidity" })).toBe("noLiquidity");
    expect(reasonKey({ state: "pending", reason: "onramp" })).toBe("onramp");
  });
});

describe("byVenue", () => {
  it("groups in the given venue order, unknown venues last", () => {
    const groups = byVenue(
      [holding("1", "kash"), holding("2", "wallet"), holding("3", "kash"), holding("4", "earn")],
      ["wallet", "kash"]
    );
    expect(groups.map((g) => [g.venue, g.holdings.length])).toEqual([
      ["wallet", 1],
      ["kash", 2],
      ["earn", 1],
    ]);
  });
});
