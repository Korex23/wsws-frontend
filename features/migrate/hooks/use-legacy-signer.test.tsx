// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RECORDED = "0xC14733501F25680e6f53c48f7afBe4F946642aD1";
const FIRST = "0xE7bBe330023C5Dd67bCF1bF0D062B3b1B1921dEB";

const state = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string; address: string }>,
  embedded: [] as Array<{ chainType: string; address: string }>,
  recordedEvm: null as string | null,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "did:privy:u" } }),
  useWallets: () => ({ wallets: state.wallets }),
}));
vi.mock("@/features/migrate/hooks/use-migration-status", () => ({
  useMigrationStatus: () => ({ data: { legacy: { evm: state.recordedEvm, solana: null } } }),
}));
vi.mock("@/lib/user", () => ({
  // The account's own embedded wallets, and "first ethereum" as the fallback.
  getEmbeddedWallets: () => state.embedded,
  getWalletAddress: (_user: unknown, chain: string) =>
    chain === "ethereum"
      ? (state.embedded.find((w) => w.chainType === "ethereum")?.address ?? null)
      : null,
}));
vi.mock("@/features/migrate/hooks/use-legacy-send", () => ({
  useLegacyEvmSendBatch: () => vi.fn(),
  useLegacySendToken: () => vi.fn(),
}));
vi.mock("@/features/migrate/hooks/use-fresh-legacy-session", () => ({
  useFreshLegacySession: () => true,
}));

import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";

beforeEach(() => {
  state.wallets = [];
  state.embedded = [{ chainType: "ethereum", address: FIRST }];
  state.recordedEvm = null;
});

describe("useLegacySigner", () => {
  // Seen live: sign-in lands, the address is on the user record, the panel
  // auto-sweeps, and every send fails "No EVM wallet is connected" because the
  // embedded wallet object had not arrived yet.
  it("hands out no signer until the embedded EVM wallet object is actually present", () => {
    const { result, rerender } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();

    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    rerender();
    expect(result.current).not.toBeNull();
    expect(result.current?.addresses.evm).toBe(FIRST);
  });

  it("an external wallet in the list does not count", () => {
    state.wallets = [{ walletClientType: "metamask", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });

  // Two embedded wallets, and the funded one is not first. The signer must
  // target the RECORDED wallet, so discovery reads where the money actually is.
  it("prefers the backend-recorded wallet over the first when the account has both", () => {
    state.embedded = [
      { chainType: "ethereum", address: FIRST },
      { chainType: "ethereum", address: RECORDED },
    ];
    state.recordedEvm = RECORDED;
    state.wallets = [
      { walletClientType: "privy", address: FIRST },
      { walletClientType: "privy", address: RECORDED },
    ];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current?.addresses.evm).toBe(RECORDED);
  });

  // The recorded wallet belongs to a different account than the one signed in.
  // It is not among these wallets, so fall back to the first — never claim an
  // address this session cannot sign for.
  it("falls back to the first wallet when the recorded one is not this account's", () => {
    state.recordedEvm = RECORDED;
    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current?.addresses.evm).toBe(FIRST);
  });

  // Recorded wallet known, but its object has not arrived yet: no signer, so no
  // send fires against a wallet that cannot yet sign.
  it("waits for the recorded wallet's object even when its address is known", () => {
    state.embedded = [
      { chainType: "ethereum", address: FIRST },
      { chainType: "ethereum", address: RECORDED },
    ];
    state.recordedEvm = RECORDED;
    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });
});
