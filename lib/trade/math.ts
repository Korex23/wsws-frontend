// Pure trade math. No framework imports. Amounts that map to on-chain base
// units use bigint so we never lose precision to floating point.

// Maintenance margin used for the simplified isolated-margin liquidation model.
// Real venues publish per-market maintenance margins. This is a UI estimate.
export const MAINTENANCE_MARGIN = 0.005;

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// Convert a human amount string ("1.5") into integer base units for a token
// with the given decimals. Invalid or empty input returns 0n.
export function toBaseUnits(human: string, decimals: number): bigint {
  const cleaned = human.trim();
  if (!cleaned || !DECIMAL_INPUT.test(cleaned)) return 0n;
  const [whole = "", frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const digits = (whole + fracPadded).replace(/^0+(?=\d)/, "");
  return BigInt(digits || "0");
}

// Convert integer base units back into a trimmed human amount string.
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const magnitude = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = magnitude.slice(0, magnitude.length - decimals);
  const frac = magnitude.slice(magnitude.length - decimals).replace(/0+$/, "");
  const value = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${value}` : value;
}

// Notional size of a leveraged position given collateral and leverage.
export function positionSize(collateral: number, leverage: number): number {
  if (collateral <= 0 || leverage <= 0) return 0;
  return collateral * leverage;
}

// Estimated liquidation price for an isolated-margin position. The position is
// liquidated once losses eat the collateral down to the maintenance margin.
export function liquidationPrice(
  entry: number,
  leverage: number,
  side: "long" | "short",
  maintenanceMargin: number = MAINTENANCE_MARGIN
): number {
  if (entry <= 0 || leverage <= 0) return 0;
  const distance = 1 / leverage - maintenanceMargin;
  return side === "long" ? entry * (1 - distance) : entry * (1 + distance);
}

// Estimated fee to open a position, a flat rate on the notional size. Like the
// liquidation model this is a UI estimate; real venues vary the rate per market.
export const OPEN_FEE_RATE = 0.0006;

export function openFee(size: number): number {
  return size > 0 ? size * OPEN_FEE_RATE : 0;
}

// Hyperliquid's taker fee, charged at fill on both open and close.
export const PERPS_TAKER_FEE_RATE = 0.0008;

export function closeFee(size: number): number {
  return size > 0 ? size * PERPS_TAKER_FEE_RATE : 0;
}

// What a take-profit or stop-loss would pay (or cost) if price reaches it.
// A display-layer projection for the order ticket, so the trader sees the
// stakes before committing — same number semantics as the rest of this file
// (the real fill sizes and settles server-side). Direction-aware: a long
// gains above entry and loses below, a short the reverse. `roePct` is the
// return on the margin actually posted (leverage-amplified), which is the
// figure traders watch, not the raw price move.
export interface TriggerProjection {
  /** Signed USD PnL on the position: positive is a gain, negative a loss. */
  pnlUsd: number;
  /** Signed return on posted margin, as a percent (pnlUsd / margin * 100). */
  roePct: number;
}

export function projectTriggerPnl(params: {
  side: "buy" | "sell";
  entryPrice: number;
  triggerPrice: number;
  sizeBaseUnits: number;
  marginUsd: number;
}): TriggerProjection | null {
  const { side, entryPrice, triggerPrice, sizeBaseUnits, marginUsd } = params;
  if (!(entryPrice > 0) || !(triggerPrice > 0) || !(sizeBaseUnits > 0) || !(marginUsd > 0)) {
    return null;
  }
  const perUnit = side === "buy" ? triggerPrice - entryPrice : entryPrice - triggerPrice;
  const pnlUsd = perUnit * sizeBaseUnits;
  return { pnlUsd, roePct: (pnlUsd / marginUsd) * 100 };
}

// A signed percent for display: "+25%", "-40%". Whole numbers stay clean; a
// fractional result keeps one decimal so small moves aren't rounded to "0%".
export function formatSignedPercent(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const digits = Math.abs(pct) >= 100 || Number.isInteger(pct) ? 0 : 1;
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

// A perps-wallet withdrawal's total cost, shown up front as one number:
// Hyperliquid's own flat $1 withdraw3 fee PLUS the platform's flat fee
// (PERPS_WITHDRAWAL_FEE_USDC on the backend, $0.50 by default), collected as a
// client-signed sendAsset to the treasury alongside the withdrawal. So ~$1.50
// total, capped at the amount.
export const WITHDRAWAL_HL_FLAT_FEE_USDC = 1;
export const WITHDRAWAL_PLATFORM_FEE_USDC = 0.5;

export function estimatedWithdrawalFee(amountUsdc: number): number {
  if (amountUsdc <= 0) return 0;
  return Math.min(amountUsdc, WITHDRAWAL_HL_FLAT_FEE_USDC + WITHDRAWAL_PLATFORM_FEE_USDC);
}

// Large dollar figures (volume, open interest) as "$1.2M" rather than every digit.
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

// Amount of the receive asset you get by paying `amount` of the pay asset,
// derived purely from live USD prices. Used when no on-chain route is available.
export function receiveFromPrices(amount: number, payPrice: number, receivePrice: number): number {
  if (amount <= 0 || payPrice <= 0 || receivePrice <= 0) return 0;
  return (amount * payPrice) / receivePrice;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const abs = Math.abs(value);
  const maxDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDigits,
  })}`;
}

// Trimmed token amount for display. Large amounts show fewer decimals.
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  const maxDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}
