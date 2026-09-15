// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearMigrationComplete,
  hasMovedFunds,
  markFundsMoved,
  markMigrationComplete,
  maskBalance,
  offerMigration,
  shouldOfferMigration,
} from "@/features/migrate/lib/visibility";
import { EMPTY_MIGRATION_STATUS } from "@/features/migrate/lib/api";

afterEach(() => {
  window.localStorage.clear();
});

describe("shouldOfferMigration", () => {
  it("stays hidden for a browser with no Privy history", () => {
    expect(shouldOfferMigration()).toBe(false);
  });

  it("offers when a Privy session key exists", () => {
    window.localStorage.setItem("privy:token", "jwt");
    expect(shouldOfferMigration()).toBe(true);
  });

  it("offers for a lapsed session that still holds any auth key", () => {
    window.localStorage.setItem("privy:connections", "[]");
    expect(shouldOfferMigration()).toBe(true);
  });

  it("retires after the migration completed", () => {
    window.localStorage.setItem("privy:token", "jwt");
    markMigrationComplete();
    expect(shouldOfferMigration()).toBe(false);
  });
});

describe("offerMigration", () => {
  const status = (overrides: Partial<typeof EMPTY_MIGRATION_STATUS>) => ({
    ...EMPTY_MIGRATION_STATUS,
    ...overrides,
  });

  it("never offers once complete, whatever the server says", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ hasLegacyFunds: true }),
      })
    ).toBe(false);
  });

  it("offers on local history alone", () => {
    expect(offerMigration({ complete: false, localHistory: true, status: undefined })).toBe(true);
  });

  it("offers on a fresh device when the server sees money or a deposit in flight", () => {
    expect(offerMigration({ complete: false, localHistory: false, status: status({}) })).toBe(
      false
    );
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: status({ hasLegacyFunds: true }),
      })
    ).toBe(true);
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: status({ pendingOnramps: ["ord_1"] }),
      })
    ).toBe(true);
  });

  it("stays hidden before the status has loaded on a fresh device", () => {
    expect(offerMigration({ complete: false, localHistory: false, status: undefined })).toBe(false);
  });
});

describe("clearMigrationComplete", () => {
  it("re-opens the door", () => {
    window.localStorage.setItem("privy:token", "jwt");
    markMigrationComplete();
    expect(shouldOfferMigration()).toBe(false);
    clearMigrationComplete();
    expect(shouldOfferMigration()).toBe(true);
  });
});

describe("maskBalance", () => {
  it("hides the figure only while the old account still holds everything", () => {
    expect(maskBalance({ offer: true, moved: false })).toBe(true);
  });

  it("shows the figure as soon as a run moved something, even unfinished", () => {
    expect(maskBalance({ offer: true, moved: true })).toBe(false);
  });

  it("never hides it once there is nothing left to offer", () => {
    expect(maskBalance({ offer: false, moved: false })).toBe(false);
  });
});

describe("markFundsMoved", () => {
  it("records that money landed, independently of completion", () => {
    window.localStorage.setItem("privy:token", "jwt");
    expect(hasMovedFunds()).toBe(false);
    markFundsMoved();
    expect(hasMovedFunds()).toBe(true);
    // The migration is still on offer: more may be left behind.
    expect(shouldOfferMigration()).toBe(true);
  });
});

describe("offerMigration on a device with no Privy history", () => {
  // The case nothing else reaches: a migrated user on a new phone. No `privy:`
  // keys to find, and /status answers nothing until a mapping exists — so they
  // sign in, see 0.00, and are offered no way to explain it.
  const base = { complete: false, localHistory: false, status: undefined };

  it("offers the sweep when the signed-in address had a Privy wallet", () => {
    expect(offerMigration({ ...base, legacyAccount: true })).toBe(true);
  });

  it("offers nothing when it did not", () => {
    expect(offerMigration({ ...base, legacyAccount: false })).toBe(false);
  });

  // The lookup answers false for an outage too, so it must never be able to
  // take the offer away from a signal that already earned it.
  it("cannot suppress the device's own Privy history", () => {
    expect(offerMigration({ ...base, localHistory: true, legacyAccount: false })).toBe(true);
  });

  it("cannot suppress the server's legacy-funds report", () => {
    const status = { hasLegacyFunds: true, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: false })).toBe(true);
  });

  it("stays silent once the migration completed here", () => {
    expect(offerMigration({ ...base, complete: true, legacyAccount: true })).toBe(false);
  });
});

describe("offerMigration once the old wallet is known to be empty", () => {
  const base = { complete: false, localHistory: true, status: undefined };

  // `privy:` keys outlive a successful sweep, so device history alone would
  // keep telling a migrated user to migrate. A read that saw every network
  // return zero settles it.
  it("retires the offer a stale Privy history would keep alive", () => {
    expect(offerMigration({ ...base, legacyFundsUsd: 0 })).toBe(false);
  });

  it("keeps offering while the wallet still holds something", () => {
    expect(offerMigration({ ...base, legacyFundsUsd: 4.2 })).toBe(true);
  });

  // The distinction the route works to preserve: a failed or partial read is
  // null, and null must never take the door away.
  it("does not retire it on an unreadable balance", () => {
    expect(offerMigration({ ...base, legacyFundsUsd: null })).toBe(true);
  });

  // Venues hold money the wallet does not, and the server knows about them.
  it("lets the server's report outrank an empty wallet", () => {
    const status = { hasLegacyFunds: true, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyFundsUsd: 0 })).toBe(true);
  });

  it("lets a pending onramp outrank an empty wallet", () => {
    const status = { hasLegacyFunds: false, pendingOnramps: ["order-1"] } as never;
    expect(offerMigration({ ...base, status, legacyFundsUsd: 0 })).toBe(true);
  });
});
