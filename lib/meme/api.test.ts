import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

import {
  TradeApiError,
  fetchSwapStatus,
  isValidTradeAmount,
  newIdempotencyKey,
  registerSubmission,
  withRiskDefaults,
} from "@/lib/meme/api";
import type { MemeToken } from "@/lib/meme/api";

describe("newIdempotencyKey", () => {
  it("returns a v4 UUID", () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("never repeats across calls", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("isValidTradeAmount", () => {
  it("accepts plain decimals within the token's precision", () => {
    expect(isValidTradeAmount("12", 6)).toBe(true);
    expect(isValidTradeAmount("12.5", 6)).toBe(true);
    expect(isValidTradeAmount("0.000001", 6)).toBe(true);
  });

  it("rejects zero, signs, exponents and excess precision", () => {
    expect(isValidTradeAmount("0", 6)).toBe(false);
    expect(isValidTradeAmount("-1", 6)).toBe(false);
    expect(isValidTradeAmount("1e3", 6)).toBe(false);
    expect(isValidTradeAmount("1,000", 6)).toBe(false);
    expect(isValidTradeAmount("0.0000001", 6)).toBe(false);
    expect(isValidTradeAmount("", 6)).toBe(false);
  });
});

describe("withRiskDefaults", () => {
  // /tokens/trending omits riskLevel, warnings, buyEnabled and sellEnabled
  // entirely. Rendering one of those rows raw crashed the dashboard, because
  // RiskBadge called .charAt on a missing level and Next replaced the whole
  // page with its unrecoverable-error screen.
  const trendingRow = {
    chainId: 8453,
    address: "0xabc",
    name: "Test",
    symbol: "TEST",
  } as unknown as MemeToken;

  it("fills the risk block a trending row does not carry", () => {
    const t = withRiskDefaults(trendingRow);
    expect(t.riskLevel).toBe("UNKNOWN");
    expect(t.warnings).toEqual([]);
  });

  it("leaves a token that already has a risk block untouched", () => {
    const rated = { ...trendingRow, riskLevel: "HIGH", warnings: [{ code: "X", message: "y" }] };
    const t = withRiskDefaults(rated as unknown as MemeToken);
    expect(t.riskLevel).toBe("HIGH");
    expect(t.warnings).toHaveLength(1);
  });

  it("treats unknown tradability as tradable, since the server re-checks it", () => {
    const t = withRiskDefaults(trendingRow);
    expect(t.buyEnabled).toBe(true);
    expect(t.sellEnabled).toBe(true);
  });
});

// The contract's failure envelope carries a requestId that support asks for.
// It has to survive the client boundary on the error itself, and the relay's
// own errors (a 502 it minted) carry one too, so a screenshot always has a
// reference whichever side failed.
describe("TradeApiError keeps the contract's requestId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    apiFetchMock.mockReset();
  });

  function answer(status: number, body: unknown) {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
  }

  it("carries the service's requestId, code and status on the thrown error", async () => {
    answer(422, {
      success: false,
      error: {
        code: "NO_SWAP_ROUTE",
        message: "no route",
        details: null,
        requestId: "req-service-1",
      },
    });
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    const error = thrown as TradeApiError;
    expect(error.code).toBe("NO_SWAP_ROUTE");
    expect(error.status).toBe(422);
    expect(error.requestId).toBe("req-service-1");
  });

  it("carries the relay's minted requestId on a 502 it produced itself", async () => {
    answer(502, {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Trading is unreachable.",
        requestId: "req-relay-9",
      },
    });
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).requestId).toBe("req-relay-9");
  });

  it("has no requestId when the body carried none, rather than inventing one", async () => {
    answer(500, "<html>upstream</html>");
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).requestId).toBeNull();
  });
});

// Base execution registers exactly one hash per call. The contract accepts
// either the transaction hash or, when the bundler never produced a receipt,
// the user-operation hash; the body must carry one and never both.
describe("registerSubmission", () => {
  afterEach(() => apiFetchMock.mockReset());

  function sentBody(): Record<string, unknown> {
    const init = apiFetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("registers a transaction hash", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { swapId: "s", status: "SUBMITTED" } }))
    );
    await registerSubmission("s", 0, "0xwallet", { transactionHash: "0xtx" }, "key-1");
    expect(sentBody()).toEqual({
      walletAddress: "0xwallet",
      callIndex: 0,
      transactionHash: "0xtx",
    });
  });

  it("registers a user-operation hash when that is all the bundler gave back", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { swapId: "s", status: "SUBMITTED" } }))
    );
    await registerSubmission("s", 1, "0xwallet", { userOperationHash: "0xuop" }, "key-2");
    const body = sentBody();
    expect(body).toEqual({ walletAddress: "0xwallet", callIndex: 1, userOperationHash: "0xuop" });
    expect(body).not.toHaveProperty("transactionHash");
  });
});
