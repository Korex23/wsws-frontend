// The trade service's token shape, in a file with no client directive so the
// server can import the type without pulling the browser client along.

export type TokenRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

// The service's lifecycle state for a catalogue row.
export type TokenStatus = "ACTIVE" | "BLOCKED" | "DISCOVERED";

export interface TokenWarning {
  code: string;
  message: string;
}

export interface MemeToken {
  chainId: number;
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logoUrl: string | null;
  priceUsd: string | null;
  liquidityUsd: string | null;
  volume24hUsd: string | null;
  priceChange24hPercent: string | null;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  pairAddress: string | null;
  dexName: string | null;
  riskLevel: TokenRiskLevel;
  // The service's lifecycle state: ACTIVE, DISCOVERED (unrated), BLOCKED.
  // Absent on the search and detail routes.
  status?: TokenStatus;
  buyEnabled: boolean;
  sellEnabled: boolean;
  warnings: TokenWarning[];
}

// GET /tokens/{address}/risk. Advisory: not a guarantee of safety.
export interface TokenRisk {
  level: TokenRiskLevel;
  blocked: boolean;
  warnings: TokenWarning[];
  assessedAt: string;
  disclaimer: string;
}

// GET /tokens/{address}/tradability. The two switches are policy hints; the
// quote still re-checks them server-side.
export interface TokenTradability {
  buyEnabled: boolean;
  sellEnabled: boolean;
  risk: TokenRisk;
}

// A token as a preview or quote names it. Only the address and symbol are read
// here; the rest arrives when the service sends it.
export interface SwapTokenRef {
  address: string;
  symbol: string | null;
  chainId?: number;
  name?: string | null;
  decimals?: number | null;
  logoUrl?: string | null;
}

export interface SwapPreview {
  side: "BUY" | "SELL";
  chainId?: number;
  walletAddress?: string;
  sellToken: SwapTokenRef;
  buyToken: SwapTokenRef;
  sellAmountAtomic: string;
  sellAmountFormatted: string;
  expectedBuyAmountAtomic: string;
  expectedBuyAmountFormatted: string;
  minimumBuyAmountAtomic: string;
  minimumBuyAmountFormatted: string;
  priceImpactBps: number | null;
  slippageBps: number;
  platformFeeAmountAtomic: string;
  platformFeeAmountFormatted: string;
  liquidityAvailable?: boolean;
  approvalRequired?: boolean;
  riskLevel: TokenRiskLevel;
  warnings: TokenWarning[];
  expiresAt: string;
}

export interface PreparedCall {
  type?: "APPROVAL" | "SWAP";
  to: string;
  data: string;
  value: string;
}

export interface PreparedSwap {
  swapId: string;
  quoteId?: string;
  chainId: number;
  side: "BUY" | "SELL";
  walletAddress?: string;
  sellToken: SwapTokenRef;
  buyToken: SwapTokenRef;
  sellAmountAtomic: string;
  expectedBuyAmountAtomic: string;
  minimumBuyAmountAtomic: string;
  slippageBps?: number;
  priceImpactBps?: number | null;
  executionMode?: "SINGLE_CALL" | "BATCHED_CALLS";
  calls: PreparedCall[];
  warnings?: TokenWarning[];
  expiresAt: string;
}

// The Solana quote is one unsigned versioned transaction for the gas
// sponsor, not a list of calls.
export interface PreparedSolanaSwap {
  swapId: string;
  unsignedTransactionBase64: string;
  platformFeeTokenAddress?: string | null;
  platformFeeAmountAtomic?: string;
  expiresAt: string;
}

export type SwapStatus =
  | "QUOTED"
  | "AWAITING_SUBMISSION"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REVERTED"
  | "EXPIRED"
  | "CANCELLED";

export interface SwapDetail {
  id: string;
  walletAddress: string;
  chainId: number;
  side: "BUY" | "SELL";
  status: SwapStatus;
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellTokenDecimals: number;
  buyTokenDecimals: number;
  sellAmountAtomic: string;
  quotedBuyAmountAtomic: string;
  actualSellAmountAtomic: string | null;
  actualBuyAmountAtomic: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface SwapStatusUpdate {
  swapId: string;
  status: SwapStatus;
  updatedAt: string;
}

export interface SubmissionReceipt {
  swapId: string;
  status: SwapStatus;
  callIndex?: number;
}

export interface WalletChallenge {
  challengeId: string;
  message: string;
  expiresAt: string;
}
