import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
const privy = vi.hoisted(() => ({ getByEmailAddress: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ verifyRequest: auth.verifyRequest }));
const alchemy = vi.hoisted(() => ({ fetchPortfolio: vi.fn() }));
vi.mock("@/lib/server/alchemy", () => ({ fetchPortfolio: alchemy.fetchPortfolio }));

const directory = vi.hoisted(() => ({ lookupLegacyEmail: vi.fn() }));
vi.mock("@/lib/server/legacy-directory", () => ({
  lookupLegacyEmail: directory.lookupLegacyEmail,
}));
vi.mock("@/lib/server/privy", () => ({
  getPrivyClient: () => ({ users: () => ({ getByEmailAddress: privy.getByEmailAddress }) }),
}));

const { POST } = await import("@/app/api/migration/legacy-account/route");

const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

const walletUser = {
  linked_accounts: [{ type: "wallet", chain_type: "ethereum", address: "0xabc" }],
};

beforeEach(() => {
  auth.verifyRequest.mockReset();
  privy.getByEmailAddress.mockReset();
  auth.verifyRequest.mockResolvedValue({ provider: "decane", userId: "u1" });
  // Unknown by default, so the existing cases exercise the Privy fallback.
  directory.lookupLegacyEmail.mockResolvedValue({ known: null, entry: null });
});

describe("POST /api/migration/legacy-account", () => {
  it("refuses without a verified session, so it is not an open lookup", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(401);
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("reports a legacy account that held an embedded wallet", async () => {
    privy.getByEmailAddress.mockResolvedValue(walletUser);
    const res = await POST(req({ email: "A@B.com" }));
    // No balance read is attempted in this test's mock, so it stays unknown.
    await expect(res.json()).resolves.toEqual({ hasLegacyAccount: true, legacyFundsUsd: null });
    // Normalised, so a capitalised address is not a different user.
    expect(privy.getByEmailAddress).toHaveBeenCalledWith({ address: "a@b.com" });
  });

  it("says no for an account that never held one — offering the sweep would dead-end", async () => {
    privy.getByEmailAddress.mockResolvedValue({ linked_accounts: [{ type: "email" }] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
    });
  });

  it("says no when Privy has no such user", async () => {
    privy.getByEmailAddress.mockRejectedValue(new Error("not found"));
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
    });
  });

  // An outage answers the same as "no such user" on purpose: false means "no
  // reason to offer it", never "you have nothing". The caller ORs it.
  it("says no, not an error, when the lookup itself fails", async () => {
    privy.getByEmailAddress.mockRejectedValue(new Error("privy down"));
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
  });

  it("never queries Privy with rubbish", async () => {
    for (const email of [undefined, "", "not-an-email", "x".repeat(400) + "@b.com"]) {
      await POST(req({ email }));
    }
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });
});

describe("the balance behind the offer", () => {
  beforeEach(() => {
    alchemy.fetchPortfolio.mockReset();
    privy.getByEmailAddress.mockResolvedValue(walletUser);
  });

  it("reports what the old wallet still holds", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 12.5, tokens: [] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 12.5,
    });
  });

  // The whole point of the balance read: `privy:` keys outlive a sweep, so a
  // migrated user would keep being told to migrate.
  it("reports a confident zero, which retires the offer", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 0, tokens: [] });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 0,
    });
  });

  // A floor is not a balance. Reporting 0 here would take the door away from
  // someone whose money is sitting right there.
  it("refuses to call a partial read zero", async () => {
    alchemy.fetchPortfolio.mockResolvedValue({
      totalUsd: 0,
      tokens: [],
      missing: ["base-mainnet"],
    });
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: null,
    });
  });

  it("stays unknown when the read throws", async () => {
    alchemy.fetchPortfolio.mockRejectedValue(new Error("alchemy down"));
    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: null,
    });
  });
});

describe("the directory comes first", () => {
  beforeEach(() => alchemy.fetchPortfolio.mockReset());

  it("answers from the snapshot without calling Privy at all", async () => {
    directory.lookupLegacyEmail.mockResolvedValue({
      known: true,
      entry: { evm: "0xabc", solana: null },
    });
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 3, tokens: [] });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 3,
    });
    // The point of the snapshot: it keeps answering after Privy is gone.
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  it("trusts a definite no from the snapshot", async () => {
    directory.lookupLegacyEmail.mockResolvedValue({ known: false, entry: null });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: false,
      legacyFundsUsd: null,
    });
    expect(privy.getByEmailAddress).not.toHaveBeenCalled();
  });

  // Unreadable is not "no": falling through is what stops a missing sheet from
  // telling every user they have nothing.
  it("falls through to Privy when the snapshot cannot be read", async () => {
    directory.lookupLegacyEmail.mockResolvedValue({ known: null, entry: null });
    privy.getByEmailAddress.mockResolvedValue(walletUser);
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 7, tokens: [] });

    await expect((await POST(req({ email: "a@b.com" }))).json()).resolves.toEqual({
      hasLegacyAccount: true,
      legacyFundsUsd: 7,
    });
    expect(privy.getByEmailAddress).toHaveBeenCalled();
  });
});
