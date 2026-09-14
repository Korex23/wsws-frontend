"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPositions } from "@/features/trade/lib/hyperliquid-api";
import type { HlPositionView } from "@/features/trade/lib/hyperliquid-types";

// Mirrors features/trade/hooks/use-perp-positions.ts's shape for the
// Hyperliquid domain. Every action this app takes on a position (open, close,
// TP/SL) refetches explicitly on completion (see hyperliquid-actions.ts's
// callers), so the background poll exists only to catch what happens with NO
// click here — live PnL ticking, or a trigger/liquidation firing on its own —
// and it runs only while there IS such exposure to watch (see the gate below).
// Positions poll faster than orders: their valuation moves continuously,
// whereas a resting order only changes when it fills or cancels.
const POSITIONS_POLL_MS = 10_000;
const SETTLE_POLL_MS = 3_000;
const SETTLE_MAX_ATTEMPTS = 10;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useHyperliquidPositions(
  walletId: string | null,
  enabled = true,
  // A resting order (a limit, or a TP/SL) can fill into a position with no
  // action here, so keep polling while any is outstanding even before a
  // position exists — otherwise a filled limit wouldn't surface until focus.
  hasPendingOrders = false
) {
  const queryClient = useQueryClient();

  const query = useQuery<HlPositionView[]>({
    queryKey: ["hl-positions", walletId],
    queryFn: () => listPositions(walletId as string),
    enabled: enabled && walletId != null,
    // Poll ONLY while there's live exposure: an open position, or a resting
    // order that could become one. Flat and orderless, this makes no repeat
    // calls at all — the mount fetch plus refetch-on-focus/on-action still
    // catch anything external. The poll is what lets the backend's
    // reconciliation sweep (ghost positions, resolved triggers) surface here
    // without a click, so "I closed it but it still shows open" can't linger.
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 || hasPendingOrders ? POSITIONS_POLL_MS : false,
  });

  const waitForChange = useCallback(
    async (changed: (positions: HlPositionView[]) => boolean): Promise<boolean> => {
      if (!walletId) return false;
      for (let attempt = 0; attempt < SETTLE_MAX_ATTEMPTS; attempt++) {
        await delay(SETTLE_POLL_MS);
        try {
          const fresh = await listPositions(walletId);
          await queryClient.cancelQueries({ queryKey: ["hl-positions", walletId] });
          queryClient.setQueryData(["hl-positions", walletId], fresh);
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
    positions: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? query.error : null,
    refetch: query.refetch,
    waitForChange,
  };
}
