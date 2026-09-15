"use client";

import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { useLegacyAccount } from "@/features/migrate/hooks/use-legacy-account";
import {
  maskBalance,
  offerMigration,
  useFundsMoved,
  useLocalPrivyHistory,
  useMigrationCompleteFlag,
} from "@/features/migrate/lib/visibility";

// Whether the balance card shows Update Balance and masks the balance: the
// device's own Privy history, or the server saying the old wallet still holds
// money, unless the migration already completed here.
export function useOfferMigration(): boolean {
  const complete = useMigrationCompleteFlag();
  const localHistory = useLocalPrivyHistory();
  const status = useMigrationStatus();
  // Asked only when the cheap signals have not already answered: a device that
  // remembers Privy, or a server that reports legacy funds, needs no lookup.
  const legacy = useLegacyAccount();
  const offer = offerMigration({
    complete,
    localHistory,
    status: status.data,
    legacyAccount: legacy.has,
    legacyFundsUsd: legacy.fundsUsd,
  });
  // Why, not just whether: the signals disagree often enough that "it did not
  // show" is otherwise impossible to diagnose.
  console.log(
    `[migrate] offer Update Balance: ${offer ? "YES" : "no"}` +
      ` (migration complete here: ${complete}, privy keys on device: ${localHistory},` +
      ` server reports funds: ${status.data?.hasLegacyFunds ?? "unknown"},` +
      ` directory: ${legacy.has ? "found" : "no account"},` +
      ` old wallet: ${legacy.fundsUsd === null ? "unreadable" : `$${legacy.fundsUsd.toFixed(2)}`})`
  );
  return offer;
}

// Whether the balance card should hide the figure. Comes off as soon as a run
// moves anything, so a partial migration shows the money that has arrived
// while the button stays for whatever is left.
export function useMaskBalance(): boolean {
  return maskBalance({ offer: useOfferMigration(), moved: useFundsMoved() });
}
