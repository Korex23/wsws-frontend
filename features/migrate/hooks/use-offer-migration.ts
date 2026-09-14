"use client";

import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
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
  return offerMigration({ complete, localHistory, status: status.data });
}

// Whether the balance card should hide the figure. Comes off as soon as a run
// moves anything, so a partial migration shows the money that has arrived
// while the button stays for whatever is left.
export function useMaskBalance(): boolean {
  return maskBalance({ offer: useOfferMigration(), moved: useFundsMoved() });
}
