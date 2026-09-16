// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string }>,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "did:privy:u" } }),
  useWallets: () => ({ wallets: state.wallets }),
}));
vi.mock("@/lib/user", () => ({
  getWalletAddress: (_user: unknown, chain: string) =>
    chain === "ethereum" ? "0xE7bBe330023C5Dd67bCF1bF0D062B3b1B1921dEB" : null,
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
});

describe("useLegacySigner", () => {
  // Seen live: sign-in lands, the address is on the user record, the panel
  // auto-sweeps, and every send fails "No EVM wallet is connected" because the
  // embedded wallet object had not arrived yet.
  it("hands out no signer until the embedded EVM wallet object is actually present", () => {
    const { result, rerender } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();

    state.wallets = [{ walletClientType: "privy" }];
    rerender();
    expect(result.current).not.toBeNull();
    expect(result.current?.addresses.evm).toBe("0xE7bBe330023C5Dd67bCF1bF0D062B3b1B1921dEB");
  });

  it("an external wallet in the list does not count", () => {
    state.wallets = [{ walletClientType: "metamask" }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });
});
