import type { z } from "zod";
import {
  activityPageSchema,
  portfolioPageSchema,
  portfolioPositionDetailSchema,
  portfolioSummarySchema,
  solanaSwapQuoteSchema,
  submissionSchema,
  swapPageSchema,
  swapPreviewSchema,
  swapQuoteSchema,
  swapStatusResponseSchema,
  tokenDetailSchema,
  tokenListItemSchema,
  tokenListSchema,
  tokenSearchSchema,
  tokenTradabilitySchema,
  walletChallengeSchema,
  walletVerifySchema,
} from "@/lib/api/schemas/trade";
import { withRiskDefaults, type Paged } from "@/lib/meme/catalog";
import type {
  MemeToken,
  PortfolioPosition,
  PortfolioPositionDetail,
  PortfolioSummary,
  PreparedSolanaSwap,
  PreparedSwap,
  SubmissionReceipt,
  SwapDetail,
  SwapPreview,
  SwapStatusUpdate,
  TokenTradability,
  TradeActivity,
  WalletChallenge,
} from "@/lib/meme/types";

// Where the trade service's JSON becomes this app's types. The browser client
// (lib/meme/api.ts) runs every envelope's data through one of these, against
// the same schemas the relay judged it by, so a component only ever holds a
// mapped value. A body that does not match throws TradeShapeError; the client
// turns that into a BAD_RESPONSE TradeApiError.

import { TradeShapeError } from "@/lib/meme/trade-shape-error";

export { TradeShapeError };

function read<S extends z.ZodType>(schema: S, data: unknown, what: string): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const problem = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new TradeShapeError(what, problem);
}

// An absent market field on a list row is "not currently available", the
// same as the null the contract sends; the absent risk block is filled by
// withRiskDefaults, whose comment carries the policy.
function toMemeToken(row: z.output<typeof tokenListItemSchema>): MemeToken {
  return withRiskDefaults({
    chainId: row.chainId,
    address: row.address,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    logoUrl: row.logoUrl,
    priceUsd: row.priceUsd,
    liquidityUsd: row.liquidityUsd,
    volume24hUsd: row.volume24hUsd ?? null,
    priceChange24hPercent: row.priceChange24hPercent ?? null,
    marketCapUsd: row.marketCapUsd ?? null,
    fdvUsd: row.fdvUsd ?? null,
    pairAddress: row.pairAddress ?? null,
    dexName: row.dexName ?? null,
    riskLevel: row.riskLevel,
    warnings: row.warnings,
    buyEnabled: row.buyEnabled,
    sellEnabled: row.sellEnabled,
    status: row.status,
  });
}

export function parseTokenPage(data: unknown): Paged<MemeToken> {
  const page = read(tokenListSchema, data, "token page");
  return { items: page.items.map(toMemeToken), meta: page.meta };
}

export function parseTokenSearch(data: unknown): MemeToken[] {
  return read(tokenSearchSchema, data, "token search").map(toMemeToken);
}

export function parseTokenView(data: unknown): MemeToken {
  return toMemeToken(read(tokenDetailSchema, data, "token detail"));
}

export function parseTradability(data: unknown): TokenTradability {
  return read(tokenTradabilitySchema, data, "token tradability");
}

export function parseSwapPreview(data: unknown): SwapPreview {
  return read(swapPreviewSchema, data, "swap preview");
}

export function parseSwapQuote(data: unknown): PreparedSwap {
  const quote = read(swapQuoteSchema, data, "swap quote");
  // An EVM call without a value transfers none.
  return { ...quote, calls: quote.calls.map((call) => ({ ...call, value: call.value ?? "0" })) };
}

export function parseSolanaSwapQuote(data: unknown): PreparedSolanaSwap {
  return read(solanaSwapQuoteSchema, data, "Solana swap quote");
}

export function parseSwapStatus(data: unknown): SwapStatusUpdate {
  return read(swapStatusResponseSchema, data, "swap status");
}

export function parseSwapPage(data: unknown): Paged<SwapDetail> {
  return read(swapPageSchema, data, "swap history");
}

export function parseSubmission(data: unknown): SubmissionReceipt {
  return read(submissionSchema, data, "submission");
}

export function parseWalletChallenge(data: unknown): WalletChallenge {
  return read(walletChallengeSchema, data, "wallet challenge");
}

// The contract names no fields for a verified link and nothing reads one.
export function parseWalletVerification(data: unknown): void {
  read(walletVerifySchema, data, "wallet verification");
}

// The portfolio routes. Nothing is filled in on the way through: a null
// valuation is the service saying it cannot price the asset, and it reaches
// the screen as null.
export function parsePortfolioPage(data: unknown): Paged<PortfolioPosition> {
  return read(portfolioPageSchema, data, "portfolio page");
}

export function parsePortfolioSummary(data: unknown): PortfolioSummary {
  return read(portfolioSummarySchema, data, "portfolio summary");
}

export function parsePortfolioPosition(data: unknown): PortfolioPositionDetail {
  return read(portfolioPositionDetailSchema, data, "portfolio position");
}

export function parseActivityPage(data: unknown): Paged<TradeActivity> {
  return read(activityPageSchema, data, "trade activity");
}
