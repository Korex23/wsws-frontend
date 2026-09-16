"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Portfolio } from "@/lib/server/alchemy";
import { walletHoldings } from "@/features/migrate/lib/venues/wallet";
import { legacyWalletHasFunds } from "@/features/migrate/lib/legacy-funds";

interface Addresses {
  evm: string | null;
  solana: string | null;
}

/**
 * The old wallet's balance, read by the frontend, as "is there anything left
 * to move": true, false, or null for "could not tell" (a partial read is a
 * floor, not an answer). Same read the wallet venue's discovery makes, so the
 * offer and the sweep can never disagree about what is there.
 *
 * Only for a linked account — before the link, the old addresses are not
 * known here, and the offer is about linking rather than money anyway.
 */
export function useLegacyWalletFunds(legacy: Addresses | null, enabled: boolean) {
  const evm = legacy?.evm ?? null;
  const solana = legacy?.solana ?? null;
  return useQuery<boolean | null>({
    queryKey: ["legacyWalletFunds", evm, solana],
    enabled: enabled && (evm !== null || solana !== null),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      // fresh=1 skips the shared server cache: money that moved seconds ago
      // must not still count as left.
      params.set("fresh", "1");
      const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) throw new Error("Couldn't read the old wallet's balances.");
      const portfolio = (await res.json()) as Portfolio;
      if (portfolio.missing?.length) return null;
      return legacyWalletHasFunds(walletHoldings(portfolio.tokens));
    },
  });
}
