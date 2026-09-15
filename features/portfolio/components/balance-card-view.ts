import type { ReactNode } from "react";
import type { TokenBalance } from "@/hooks/use-portfolio";

// What both balance screens render from. The card itself owns the hooks and
// hands the resolved values down, so the phone and desktop screens stay purely
// presentational and neither runs an effect the other would duplicate.
export interface BalanceCardViewProps {
  totalUsd: number;
  readyToSpend: number;
  tokens: TokenBalance[];
  loading: boolean;
  refreshing: boolean;
  /** True only when the fetch failed AND nothing cached survived. */
  errored: boolean;
  depositPending: boolean;
  withdrawHeld: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  /** Formats an amount in the selected currency, then masks it if hidden. */
  formatMasked: (amount: number) => string;
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  /**
   * The migration's one-click sweep, sat between Add funds and Withdraw for a
   * user whose money is still in their old wallet. Supplied by the route, not
   * reached for here: it belongs to another feature, and features never import
   * each other. Null for everyone else.
   */
  updateBalanceSlot?: ReactNode;
  /**
   * Replays the walkthrough. Supplied by the route rather than reached for
   * here: the tour is another feature, and features never import each other.
   */
  onTakeTour: () => void;
}
