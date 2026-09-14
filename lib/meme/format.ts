// Display helpers for the trade service's decimal strings. The contract's
// rule, applied here once: null means "not currently available". It is never
// coerced to zero, and a real zero is never hidden as if it were missing.

export type ChangeDirection = "up" | "down";

/**
 * The direction of a signed percentage-point change, or null when the service
 * published none. A null change draws neutral: never green, never red.
 */
export function changeDirection(value: string | null | undefined): ChangeDirection | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= 0 ? "up" : "down";
}

/** A chart's `up` flag for a change: null, drawn neutral, when none was published. */
export function chartUp(value: string | null | undefined): boolean | null {
  const direction = changeDirection(value);
  return direction === null ? null : direction === "up";
}

/** Compact USD for market stats ("$1.2M"); a real "0" is "$0", only a missing figure is "—". */
export function compactUsd(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const shown = Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}$${shown}`;
}
