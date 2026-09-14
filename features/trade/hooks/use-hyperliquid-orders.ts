"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listOrders } from "@/features/trade/lib/hyperliquid-api";
import { isRestingOrder, type HlOrderRow } from "@/features/trade/lib/hyperliquid-types";

// Every action this app takes (place, cancel, close, TP/SL) refetches
// explicitly, so this poll only backstops a resting order that fills or
// cancels with no click here. It runs at a DISTINCT, slower cadence than
// positions and ONLY while at least one order is actually resting: a filled or
// cancelled order can't change again, so there's nothing to watch once none
// are outstanding. Idle, this makes no repeat calls.
const ORDERS_POLL_MS = 30_000;
const SETTLE_POLL_MS = 3_000;
const SETTLE_MAX_ATTEMPTS = 10;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useHyperliquidOrders(walletId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery<HlOrderRow[]>({
    queryKey: ["hl-orders", walletId],
    queryFn: () => listOrders(walletId as string),
    enabled: enabled && walletId != null,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isRestingOrder) ? ORDERS_POLL_MS : false,
  });

  // Mirrors use-hyperliquid-positions.ts's waitForChange — listOrders returns
  // EVERY order for the wallet, not just resting ones, so a cancelled/filled
  // order doesn't disappear from the array, it just changes status. Callers
  // pass a predicate over the full row set for exactly that reason.
  const waitForChange = useCallback(
    async (changed: (orders: HlOrderRow[]) => boolean): Promise<boolean> => {
      if (!walletId) return false;
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        await delay(SETTLE_POLL_MS);
        try {
          const fresh = await listOrders(walletId);
          await queryClient.cancelQueries({ queryKey: ["hl-orders", walletId] });
          queryClient.setQueryData(["hl-orders", walletId], fresh);
          if (changed(fresh)) return true;
        } catch {
          // A transient poll failure just means try again on the next tick.
        }
      }
      return false;
    },
    [walletId, queryClient]
  );

  return {
    orders: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? query.error : null,
    refetch: query.refetch,
    waitForChange,
  };
}
