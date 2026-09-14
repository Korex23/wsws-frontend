import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { memeToken } from "@/features/trade/lib/meme-fixture";

// The contract's detail-route semantics for Solana: 502 PROVIDER_ERROR means
// every RPC provider was unavailable, so retry with exponential backoff and
// show a temporary state; 404 TOKEN_NOT_FOUND is a confirmed absence. Neither
// is stored as a token that does not exist.

const api = vi.hoisted(() => ({ fetchToken: vi.fn() }));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  fetchToken: api.fetchToken,
}));

import { TradeApiError } from "@/lib/meme/api";
import { useMemeToken } from "@/features/trade/hooks/use-meme-tokens";

const MINT = { address: "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp", chainId: 101 };
const providerError = () => new TradeApiError("PROVIDER_ERROR", "rpc down", 502, "req-502");
const notFound = () => new TradeApiError("TOKEN_NOT_FOUND", "absent", 404, "req-404");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

// TanStack delivers a settled state to observers on a zero-delay timer, so an
// assertion about what the hook reports needs the tick after the fetch settles.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const settle = () => advance(1);

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchToken.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useMemeToken on a provider outage", () => {
  it("retries a 502 four times with exponential backoff, then says it is temporary", async () => {
    api.fetchToken.mockRejectedValue(providerError());
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });

    await advance(0);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    // 1 s, 2 s, 4 s, 8 s between attempts.
    await advance(999);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.fetchToken).toHaveBeenCalledTimes(2);
    await advance(2_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(3);
    await advance(4_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(4);
    expect(result.current.unavailable).toBeNull();
    await advance(8_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(5);

    await settle();
    expect(result.current.unavailable).toBe("temporary");
    expect(result.current.token).toBeNull();
    // No fifth retry (and still short of the 30 s poll).
    await advance(10_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(5);
  });

  it("recovers the moment a retry succeeds", async () => {
    api.fetchToken
      .mockRejectedValueOnce(providerError())
      .mockResolvedValueOnce(memeToken({ symbol: "HACHI" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(1_000);
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");
    expect(result.current.unavailable).toBeNull();
  });
});

describe("useMemeToken on a missing token", () => {
  it("does not retry a 404 and says not found", async () => {
    api.fetchToken.mockRejectedValue(notFound());
    const { wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(0);
    await advance(20_000);
    expect(api.fetchToken).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe("not-found");
  });
});

describe("neither failure is a negative cache entry", () => {
  it("stores no token for the failed read, so the next read asks again", async () => {
    api.fetchToken.mockRejectedValue(notFound());
    const { client, wrapper } = setup();
    renderHook(() => useMemeToken(MINT), { wrapper });
    await advance(0);
    expect(client.getQueryData(["meme", "token", MINT.chainId, MINT.address])).toBeUndefined();
  });

  it("keeps the last good read on screen when a later poll hits a 502", async () => {
    api.fetchToken.mockResolvedValueOnce(memeToken({ symbol: "HACHI" }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMemeToken(MINT), { wrapper });
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");

    api.fetchToken.mockRejectedValue(providerError());
    await act(async () => {
      void client.refetchQueries({ queryKey: ["meme", "token"] });
    });
    await advance(1_000 + 2_000 + 4_000 + 8_000);
    await settle();
    expect(result.current.token?.symbol).toBe("HACHI");
    expect(result.current.unavailable).toBe("temporary");
  });
});
