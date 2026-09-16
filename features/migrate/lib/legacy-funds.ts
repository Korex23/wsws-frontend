import type { LegacyHolding } from "@/lib/migration/types";

/**
 * Whether the old wallet still holds anything the migration could move —
 * decided from the frontend's OWN read of that wallet.
 *
 * The service's `hasLegacyFunds` is not that fact: it also says "yes" while
 * any ledger re-key is still pending, a backend queue the user cannot act on
 * and which sits that way for as long as a consumer is down. Seen live: an
 * account whose old wallet read 0 ETH / 0 USDC / 0 KSH on chain, offered the
 * migration — and gated on it — because four re-keys were `pending`.
 *
 * Only sweepable balances count. What cannot move (an unsponsored network)
 * must not keep open an offer the user has no way to finish.
 */
export function legacyWalletHasFunds(holdings: readonly LegacyHolding[]): boolean {
  return holdings.some((h) => h.settleability.state === "now" && h.amount > 0n);
}
