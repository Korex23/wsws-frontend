"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { getWalletAddress } from "@/lib/user";
import type { LegacySigner } from "@/lib/migration/types";
import {
  useLegacyEvmSendBatch,
  useLegacySendToken,
} from "@/features/migrate/hooks/use-legacy-send";

// The old Privy wallets as a plain signer object, so venue adapters (which
// never import Privy) can spend from them. Null until the user has signed in
// to the old account. Must render inside LegacyPrivyProvider.
export function useLegacySigner(): LegacySigner | null {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const sendBatch = useLegacyEvmSendBatch();
  const sendToken = useLegacySendToken();

  return useMemo(() => {
    if (!ready || !authenticated) return null;
    const evm = getWalletAddress(user, "ethereum");
    const solana = getWalletAddress(user, "solana");
    if (!evm && !solana) return null;
    return {
      addresses: { evm, solana },
      sendBatch,
      sendToken,
      async getEthereumProvider() {
        const wallet = wallets.find((w) => w.walletClientType === "privy");
        if (!wallet) throw new Error("Your old wallet is not connected. Sign in again.");
        return (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      },
    };
  }, [ready, authenticated, user, wallets, sendBatch, sendToken]);
}
