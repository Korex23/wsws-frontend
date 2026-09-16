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

  // The device flag is per browser, not per account, and can be written by a
  // sweep whose link never landed. So it only fills the gap the service
  // leaves; a real "not linked" from the service outranks it.
  it("offers when the service says not linked, even if this device says done", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ linked: false }),
      })
    ).toBe(true);
  });

  it("offers a NEW account on a device another account finished on", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: false }),
        legacyAccount: true,
      })
    ).toBe(true);
  });

  it("keeps the device flag when the service could not say", () => {
    // EMPTY_MIGRATION_STATUS carries linked: null — "no answer", not "no" —
    // and nothing known on the old side, so the device's memory stands.
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ hasLegacyFunds: false }),
      })
    ).toBe(false);
  });

  it("keeps the device flag before the status has loaded", () => {
    expect(offerMigration({ complete: true, localHistory: true, status: undefined })).toBe(false);
  });

  it("never offers once linked with nothing left on the old side, whatever the device says", () => {
    expect(
      offerMigration({
        complete: false,
        localHistory: true,
        status: status({ linked: true, hasLegacyFunds: false }),
        legacyAccount: true,
      })
    ).toBe(false);
  });

  // Linking moves the identity, not the tokens. Seen live: a linked account
  // with $1 still on the old wallet, sweep failed, and the button gone.
  it("keeps offering a linked account while the old wallet still holds funds", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, hasLegacyFunds: true }),
      })
    ).toBe(true);
  });

  it("keeps offering while a deposit is still landing on the old wallet", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, pendingOnramps: ["onramp-1"] }),
      })
    ).toBe(true);
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

describe("offerMigration — the frontend's read of the old wallet", () => {
  const status = (overrides: Partial<typeof EMPTY_MIGRATION_STATUS>) => ({
    ...EMPTY_MIGRATION_STATUS,
    ...overrides,
  });

  // Seen live: 0 ETH / 0 USDC / 0 KSH on chain, four re-keys pending, and the
  // service's flag alone kept the migration — and the gate — open.
  it("does not offer a linked account whose old wallet is empty on chain, whatever the service says", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: true,
        status: status({ linked: true, hasLegacyFunds: true }),
        legacyAccount: true,
        walletFunds: false,
      })
    ).toBe(false);
  });

  it("offers a linked account whose old wallet still holds something, even if the service says not", () => {
    expect(
      offerMigration({
        complete: true,
        localHistory: false,
        status: status({ linked: true, hasLegacyFunds: false }),
        walletFunds: true,
      })
    ).toBe(true);
  });

  it("falls back to the service when the wallet could not be read", () => {
    const base = {
      complete: true,
      localHistory: false,
      status: status({ linked: true, hasLegacyFunds: true }),
    };
    expect(offerMigration({ ...base, walletFunds: null })).toBe(true);
    expect(offerMigration({ ...base, walletFunds: undefined })).toBe(true);
  });
});
