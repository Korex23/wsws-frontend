"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  TradeApiError,
  fetchToken,
  fetchTokenCatalog,
  fetchTrendingTokens,
  searchTokens,
  type MemeToken,
} from "@/lib/meme/api";
import type { MemeChainSlug } from "@/lib/meme/chain";
import { useSectionActive } from "@/components/ui/section-visibility";

const TRENDING_POLL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 350;

export function useTrendingMemes() {
  const active = useSectionActive();
  const query = useQuery({
    queryKey: ["meme", "trending"],
    queryFn: fetchTrendingTokens,
    // `subscribed`, not `enabled`. Both stop the timer, but `enabled: false`
    // also parks the query in `pending` with its data unavailable and
    // `refetch()` refused, so scrolling back showed a skeleton. `subscribed`
    // only detaches the observer: the last data stays on screen, `refetch()`
    // still works, and the query drops out of the window-focus herd too.
    subscribed: active,
    refetchInterval: TRENDING_POLL_MS,
    staleTime: 15_000,
  });
  return {
    tokens: query.data?.items ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}

// The server-paginated catalog, optionally scoped to one chain. The previous
// page stays on screen while the next loads, so paging never blanks the list.
export function useMemeCatalog(page: number, limit = 10, chain?: MemeChainSlug) {
  const query = useQuery({
    queryKey: ["meme", "catalog", page, limit, chain ?? "all"],
    queryFn: () => fetchTokenCatalog(page, limit, chain),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const total = query.data?.meta.total ?? 0;
  return {
    tokens: query.data?.items ?? [],
    pageCount: Math.max(1, Math.ceil(total / limit)),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// Debounced provider-backed search (rate limited upstream at 30/min). Queries
// under two characters never leave the client.
export function useMemeSearch(raw: string) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const q = raw.trim();
    const id = setTimeout(() => setDebounced(q.length >= 2 ? q : ""), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [raw]);

  const query = useQuery({
    queryKey: ["meme", "search", debounced],
    queryFn: () => searchTokens(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  return {
    results: query.data ?? [],
    searching: debounced.length >= 2 && query.isPending,
    active: debounced.length >= 2,
    // A failed search is not "nothing matched"; the list says so instead.
    error: query.error,
  };
}

// The contract's detail-route semantics. HTTP 502 PROVIDER_ERROR means every
// Solana RPC provider was unavailable or rate-limited: temporary, so retry with
// exponential backoff. HTTP 404 TOKEN_NOT_FOUND is a lookup that succeeded and
// found nothing: never retried. A failure that never reached the service (no
// TradeApiError) is treated as temporary too. Neither is cached as a missing
// token: a failed query stores no data, and the relay caches only successes.
const TOKEN_RETRIES = 4;
const TOKEN_RETRY_BASE_MS = 1_000;

export type MemeTokenUnavailable = "temporary" | "not-found";

function isTemporary(error: unknown): boolean {
  return !(error instanceof TradeApiError) || error.status === 502;
}

function unavailableReason(error: unknown): MemeTokenUnavailable | null {
  if (!error) return null;
  return error instanceof TradeApiError && error.status === 404 ? "not-found" : "temporary";
}

// Fresh risk-assessed details for the selected token; search rows don't carry
// current risk/tradability, so the trade surface always re-reads this.
// Identity is chainId + address, per the service contract: the detail route
// needs the chain by name, and two chains can carry the same symbol.
export function useMemeToken(identity: Pick<MemeToken, "address" | "chainId"> | null) {
  const active = useSectionActive();
  const address = identity?.address ?? null;
  const chainId = identity?.chainId ?? null;
  const query = useQuery({
    queryKey: ["meme", "token", chainId, address],
    queryFn: () => fetchToken(address as string, chainId as number),
    subscribed: active,
    enabled: !!address && chainId !== null,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: (failureCount, error) => isTemporary(error) && failureCount < TOKEN_RETRIES,
    // 1 s, 2 s, 4 s, 8 s.
    retryDelay: (failureCount) => TOKEN_RETRY_BASE_MS * 2 ** failureCount,
  });
  return {
    // The last good read stays on screen through a later failure.
    token: query.data ?? null,
    isLoading: query.isPending && !!address,
    unavailable: unavailableReason(query.error),
  };
}
