import { describe, expect, it } from "vitest";
import {
  TradeShapeError,
  parseSolanaSwapQuote,
  parseSubmission,
  parseSwapPage,
  parseSwapPreview,
  parseSwapQuote,
  parseSwapStatus,
  parseTokenPage,
  parseTokenSearch,
  parseTokenView,
  parseTradability,
  parseWalletChallenge,
} from "@/lib/meme/parse";
import {
  LIVE_SEARCH_ROW,
  LIVE_TOKEN_DETAIL,
  LIVE_TOKEN_PAGE,
  LIVE_TRADABILITY,
  SOLANA_SWAP_QUOTE,
  SUBMISSION,
  SWAP_PAGE,
  SWAP_PREVIEW,
  SWAP_QUOTE,
  SWAP_STATUS,
  WALLET_CHALLENGE,
} from "@/lib/api/schemas/trade.fixtures";

// The mappers are the one place raw trade-service JSON becomes this app's
// types: a component downstream only ever holds what they return.

describe("parseTokenPage", () => {
  it("maps a live catalog page and keeps the server's meta", () => {
    const page = parseTokenPage(LIVE_TOKEN_PAGE);
    expect(page.meta).toEqual({ page: 1, limit: 2, total: 105200 });
    expect(page.items[1]).toMatchObject({
      chainId: 8453,
      address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
      riskLevel: "LOW",
      status: "ACTIVE",
      warnings: [],
    });
    expect(page.items[0].warnings[0].code).toBe("LOW_LIQUIDITY");
  });

  it("does not carry fields the contract does not define", () => {
    const page = parseTokenPage({
      ...LIVE_TOKEN_PAGE,
      items: [{ ...LIVE_TOKEN_PAGE.items[0], chain: "solana", internalScore: 9 }],
    });
    expect(page.items[0]).not.toHaveProperty("internalScore");
  });

  it("throws a shape error for a page without meta", () => {
    expect(() => parseTokenPage({ items: LIVE_TOKEN_PAGE.items })).toThrow(TradeShapeError);
  });
});

describe("parseTokenSearch", () => {
  // The live search route omits the risk block. The row must still render:
  // unrated, no warnings, tradability left to the server's quote check.
  it("fills the risk block the live search route omits", () => {
    const [row] = parseTokenSearch([LIVE_SEARCH_ROW]);
    expect(row.riskLevel).toBe("UNKNOWN");
    expect(row.warnings).toEqual([]);
    expect(row.buyEnabled).toBe(true);
    expect(row.sellEnabled).toBe(true);
    expect(row.status).toBeUndefined();
  });

  it("keeps a null market field null, never zero", () => {
    const [row] = parseTokenSearch([LIVE_SEARCH_ROW]);
    expect(row.priceChange24hPercent).toBeNull();
    expect(row.decimals).toBeNull();
    expect(row.logoUrl).toBeNull();
  });

  it("reads an absent market field as unavailable", () => {
    const sparse = Object.fromEntries(
      Object.entries(LIVE_SEARCH_ROW).filter(([k]) => k !== "volume24hUsd" && k !== "marketCapUsd")
    );
    const [row] = parseTokenSearch([sparse]);
    expect(row.volume24hUsd).toBeNull();
    expect(row.marketCapUsd).toBeNull();
  });
});

describe("parseTokenView", () => {
  it("maps the detail route, case-sensitive Solana address included", () => {
    const token = parseTokenView(LIVE_TOKEN_DETAIL);
    expect(token.address).toBe("x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp");
    expect(token.riskLevel).toBe("HIGH");
    expect(token.liquidityUsd).toBe("57318");
  });

  it("throws a shape error when the risk level is not one of the five", () => {
    expect(() => parseTokenView({ ...LIVE_TOKEN_DETAIL, riskLevel: "SAFE" })).toThrow(
      TradeShapeError
    );
  });
});

describe("parseTradability", () => {
  it("keeps the service's risk assessment beside the two switches", () => {
    const tradability = parseTradability(LIVE_TRADABILITY);
    expect(tradability.buyEnabled).toBe(true);
    expect(tradability.risk.level).toBe("HIGH");
    expect(tradability.risk.disclaimer).toContain("No automated check");
  });
});

describe("swap mappers", () => {
  it("maps a preview, fee and expiry included", () => {
    const preview = parseSwapPreview(SWAP_PREVIEW);
    expect(preview.platformFeeAmountFormatted).toBe("0.025");
    expect(preview.expiresAt).toBe(SWAP_PREVIEW.expiresAt);
    expect(preview.buyToken.symbol).toBe("MENTE");
    expect(preview.priceImpactBps).toBe(12);
  });

  it("maps a Base quote with its ordered calls", () => {
    const quote = parseSwapQuote(SWAP_QUOTE);
    expect(quote.calls.map((c) => c.to)).toEqual(["0xusdc", "0xrouter"]);
    expect(quote.calls[0].value).toBe("0");
    expect(quote.chainId).toBe(8453);
  });

  it("defaults a call's value to zero only where the contract omits it", () => {
    const quote = parseSwapQuote({
      ...SWAP_QUOTE,
      calls: [{ to: "0xrouter", data: "0xabcdef" }],
    });
    expect(quote.calls[0].value).toBe("0");
  });

  it("maps a Solana quote", () => {
    expect(parseSolanaSwapQuote(SOLANA_SWAP_QUOTE).unsignedTransactionBase64).toBe("AQAB");
  });

  it("maps status, history, submissions and challenges", () => {
    expect(parseSwapStatus(SWAP_STATUS).status).toBe("CONFIRMING");
    expect(parseSwapPage(SWAP_PAGE).meta.total).toBe(1);
    expect(parseSubmission(SUBMISSION).status).toBe("SUBMITTED");
    expect(parseWalletChallenge(WALLET_CHALLENGE).message).toBe("Sign to link this wallet");
  });

  it("throws a shape error naming the field that drifted", () => {
    const error = (() => {
      try {
        parseSwapStatus({ swapId: "s1", status: "DONE", updatedAt: "x" });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(TradeShapeError);
    expect((error as TradeShapeError).message).toContain("status");
  });
});
