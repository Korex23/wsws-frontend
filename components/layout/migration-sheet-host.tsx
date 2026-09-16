"use client";

import type { MigrationEntry } from "@/features/migrate/components/move-old-money-panel";
import { MoveOldMoneySheet } from "@/features/migrate/components/move-old-money-sheet";
import { MIGRATION_ADAPTERS } from "@/components/layout/migration-adapters";

/**
 * The migration sheet with its adapter list already bound, so callers can load
 * the whole thing behind next/dynamic and keep it out of the app shell.
 *
 * Why this file exists: the sheet mounts LegacyPrivyProvider (the entire Privy
 * SDK, which the sweep still signs with) and MIGRATION_ADAPTERS reaches into
 * the trade, prediction, casino and portfolio barrels. Imported statically from
 * the sidebar or the session provider — both mounted on every signed-in route —
 * that is two wallet SDKs and four feature barrels in the initial payload, for
 * a sheet almost nobody opens. Same mistake, same fix, as the casino barrel
 * note in app/(session)/providers.tsx.
 *
 * Adapters stay a prop into the feature, not an import inside it: features do
 * not import each other, the app layer composes them.
 */
export function MigrationSheetHost({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: MigrationEntry;
}) {
  return (
    <MoveOldMoneySheet open={open} onClose={onClose} adapters={MIGRATION_ADAPTERS} entry={entry} />
  );
}

export default MigrationSheetHost;
