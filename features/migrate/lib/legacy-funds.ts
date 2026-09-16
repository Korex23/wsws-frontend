import type { LegacyHolding } from "@/lib/migration/types";
import { worthShowing } from "@/features/migrate/lib/review";

/**
 * What the old wallet still holds that the migration could move — decided
 * from the frontend's OWN read of that wallet.
 *
 * The service's `hasLegacyFunds` is not that fact: its probe reads ETH and
 * USDC only, so a wallet holding $1.46 of memecoins reports $0; and it also
 * says "yes" while any ledger re-key is pending, a backend queue the user
 * cannot act on. Seen live, both ways round.
 *
 * Only what can move and is worth a cent counts. A balance on an unsponsored
 * network cannot be moved, and dust below the review's own display floor
 * must not hold a gate shut — a wallet here carried 17 sub-cent tokens, any
 * one of which could revert on transfer forever. The sweep still attempts
 * dust; it just cannot hold the user hostage.
 */
export function legacyWalletMovable(holdings: readonly LegacyHolding[]): LegacyHolding[] {
  // worthShowing uses the sweep floor, so this counts exactly what the sweep
  // would move: sub-floor dead tokens are not "money left".
  return holdings.filter(
    (h) => h.settleability.state === "now" && h.amount > 0n && worthShowing(h)
  );
}

export function legacyWalletHasFunds(holdings: readonly LegacyHolding[]): boolean {
  return legacyWalletMovable(holdings).length > 0;
}

/** Display total of what could move — the figure "$X still in your old wallet" should show. */
export function legacyWalletUsd(holdings: readonly LegacyHolding[]): number {
  return legacyWalletMovable(holdings).reduce((sum, h) => sum + h.valueUsd, 0);
}
