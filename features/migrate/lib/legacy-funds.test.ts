import { describe, expect, it } from "vitest";
import { legacyWalletHasFunds } from "@/features/migrate/lib/legacy-funds";
import type { LegacyHolding } from "@/lib/migration/types";

function holding(id: string, overrides: Partial<LegacyHolding> = {}): LegacyHolding {
  return {
    id,
    venue: "wallet",
    kind: "token",
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 1,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
    ...overrides,
  };
}

describe("legacyWalletHasFunds", () => {
  it("is false for an empty wallet", () => {
    expect(legacyWalletHasFunds([])).toBe(false);
    expect(legacyWalletHasFunds([holding("a", { amount: 0n })])).toBe(false);
  });

  it("is true for any sweepable balance, however small", () => {
    expect(legacyWalletHasFunds([holding("dust", { amount: 1n, valueUsd: 0 })])).toBe(true);
  });

  // A balance on a network the sponsor does not cover cannot be moved, so it
  // must not keep open an offer the user has no way to finish.
  it("ignores what cannot move", () => {
    expect(
      legacyWalletHasFunds([
        holding("stuck", { settleability: { state: "stranded", reason: "unsponsoredNetwork" } }),
      ])
    ).toBe(false);
  });
});
