import { describe, expect, it } from "vitest";
import {
  legacyWalletHasFunds,
  legacyWalletMovable,
  legacyWalletUsd,
} from "@/features/migrate/lib/legacy-funds";
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

describe("the old wallet, read by the frontend", () => {
  it("is empty with nothing, or nothing above zero", () => {
    expect(legacyWalletHasFunds([])).toBe(false);
    expect(legacyWalletHasFunds([holding("a", { amount: 0n })])).toBe(false);
    expect(legacyWalletUsd([])).toBe(0);
  });

  // The wallet that prompted this: cbXRP $0.92, CHIP $0.40, BLUESCREEN $0.12,
  // DOBBY $0.015 and 17 tokens worth less than a cent. The service saw $0.
  // The wallet that prompted the floor: cbXRP $0.92 and CHIP $0.40 count;
  // DOBBY $0.015 and the sub-cent memecoins are dead and skipped.
  it("counts tokens above the sweep floor, drops the dead ones", () => {
    const list = [
      holding("cbXRP", { symbol: "cbXRP", valueUsd: 0.92 }),
      holding("CHIP", { symbol: "CHIP", valueUsd: 0.4 }),
      holding("DOBBY", { symbol: "DOBBY", valueUsd: 0.015 }),
    ];
    expect(legacyWalletHasFunds(list)).toBe(true);
    expect(legacyWalletUsd(list)).toBeCloseTo(1.32, 6);
    expect(legacyWalletMovable(list).map((h) => h.id)).toEqual(["cbXRP", "CHIP"]);
  });

  // Dust cannot hold a gate shut: one sub-cent token that reverts on transfer
  // would otherwise keep the user here forever.
  it("ignores dust below the review's display floor", () => {
    const dust = [
      holding("PPOLY", { amount: 9n, valueUsd: 6.7e-26 }),
      holding("BRIAN", { amount: 3n, valueUsd: 6.9e-17 }),
    ];
    expect(legacyWalletHasFunds(dust)).toBe(false);
    expect(legacyWalletMovable(dust)).toEqual([]);
  });

  it("ignores what cannot move", () => {
    expect(
      legacyWalletHasFunds([
        holding("stuck", { settleability: { state: "stranded", reason: "unsponsoredNetwork" } }),
      ])
    ).toBe(false);
  });
});
