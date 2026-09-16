"use client";

import { UpdateBalanceButton } from "@/features/migrate/components/update-balance-button";
import { MIGRATION_ADAPTERS } from "@/components/layout/migration-adapters";

/**
 * The one-click sweep button with its adapter list bound, for the dashboard to
 * load behind next/dynamic.
 *
 * It mounts LegacyPrivyProvider — the whole Privy SDK — and the adapters reach
 * into four feature barrels, so a static import from the balance card would put
 * both back into every signed-in route's initial payload. That is the
 * regression that broke the first-load budget; see migration-sheet-host.
 *
 * Adapters stay a prop into the feature: features do not import each other, the
 * app layer composes them.
 */
export function UpdateBalanceHost() {
  return <UpdateBalanceButton adapters={MIGRATION_ADAPTERS} />;
}

export default UpdateBalanceHost;
