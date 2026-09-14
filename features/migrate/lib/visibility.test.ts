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
