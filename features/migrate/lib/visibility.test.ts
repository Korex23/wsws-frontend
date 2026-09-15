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

describe("offerMigration once the account is linked", () => {
  const base = { complete: false, localHistory: true, status: undefined };

  // Linking is what the offer is FOR, so a linked account has nothing left to
  // ask for — the ledgers re-key themselves from the mapping.
  it("stops offering once the mapping exists", () => {
    const status = { linked: true, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status })).toBe(false);
  });

  // The case this rewrite exists for. An empty wallet used to retire the
  // offer, which silenced it for exactly the users with the most to lose: the
  // re-key carries a profile, followers, posts and ledgers that no balance can
  // see.
  it("still offers to an unlinked user whose wallet is empty", () => {
    const status = { linked: false, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: true })).toBe(true);
  });

  it("offers on the directory alone, with no device history and no service", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: undefined,
        legacyAccount: true,
      })
    ).toBe(true);
  });

  it("stays silent when nothing says this user is legacy", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: false,
        status: undefined,
        legacyAccount: false,
      })
    ).toBe(false);
  });

  // Linked outranks every "still legacy" signal: privy keys outlive a link.
  it("lets linked outrank stale device history", () => {
    const status = { linked: true, hasLegacyFunds: false, pendingOnramps: [] } as never;
    expect(offerMigration({ ...base, status, legacyAccount: true })).toBe(false);
  });
});
