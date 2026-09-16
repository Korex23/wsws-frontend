"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { getEmbeddedWallets, getWalletAddress } from "@/lib/user";
import type { LegacySigner } from "@/lib/migration/types";
import {
  useLegacyEvmSendBatch,
  useLegacySendToken,
} from "@/features/migrate/hooks/use-legacy-send";
import { useFreshLegacySession } from "@/features/migrate/hooks/use-fresh-legacy-session";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";

// The old Privy wallets as a plain signer object, so venue adapters (which
// never import Privy) can spend from them. Null until the user has signed in
// to the old account IN THIS PAGE LOAD — a session Privy restored on its own is
// discarded first, see useFreshLegacySession. Must render inside
// LegacyPrivyProvider.
export function useLegacySigner(): LegacySigner | null {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const sendBatch = useLegacyEvmSendBatch();
  const sendToken = useLegacySendToken();
  // A session restored from Privy's own storage is not proof of who is sitting
  // here, and everything below spends real money on that basis. No signer is
  // handed out until the inherited one has been discarded and the old account
  // has signed in again.
  const fresh = useFreshLegacySession();
  // The wallet the backend linked and that provably holds the funds. When the
  // signed-in account has more than one embedded EVM wallet, getWalletAddress
  // returns the FIRST — which need not be the funded one, so discovery reads an
  // empty wallet and the review says "nothing to move" while the money sits at
  // the recorded address. Prefer that recorded address whenever it is one of
  // this account's own wallets; otherwise the account simply differs, and the
  // first wallet is the right fallback.
  const recordedEvm = useMigrationStatus().data?.legacy?.evm ?? null;

  return useMemo(() => {
    if (!fresh || !ready || !authenticated) return null;
    const ownEvm = getEmbeddedWallets(user)
      .filter((w) => w.chainType === "ethereum")
      .map((w) => w.address.toLowerCase());
    const evm =
      recordedEvm && ownEvm.includes(recordedEvm.toLowerCase())
        ? recordedEvm
        : getWalletAddress(user, "ethereum");
    const solana = getWalletAddress(user, "solana");
    if (!evm && !solana) return null;
    // The ADDRESS is on the user record the moment sign-in lands; the wallet
    // OBJECT arrives later, once Privy's embedded-wallet iframe has initialised.
    // A signer handed out in between fails every send — "No EVM wallet is
    // connected", "iframe not initialized" — which is exactly what the
    // automatic sweep did when it fired on the first render after login. So no
    // signer until the wallet it would spend from is actually here.
    const matchesChosen = (w: (typeof wallets)[number]) =>
      w.walletClientType === "privy" &&
      Boolean(evm) &&
      w.address.toLowerCase() === evm!.toLowerCase();
    // The SPECIFIC funded wallet must be present, not merely any privy wallet:
    // signing from the wrong one of two embedded wallets moves nothing.
    if (evm && !wallets.some(matchesChosen)) return null;
    return {
      addresses: { evm, solana },
      sendBatch,
      sendToken,
      async getEthereumProvider() {
        const wallet = wallets.find(matchesChosen);
        if (!wallet) throw new Error("Your old wallet is not connected. Sign in again.");
        return (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      },
    };
  }, [fresh, ready, authenticated, user, wallets, recordedEvm, sendBatch, sendToken]);
}
