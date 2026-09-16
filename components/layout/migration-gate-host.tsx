"use client";

import { MigrationGate } from "@/features/migrate/components/migration-gate";
import { MIGRATION_ADAPTERS } from "@/components/layout/migration-adapters";

/**
 * The migration gate with its adapter list bound, for the shell to load behind
 * next/dynamic. Same reasoning as update-balance-host: it mounts the whole
 * Privy SDK and reaches four feature barrels, which must not ride into every
 * signed-in route's first load.
 */
export function MigrationGateHost() {
  return <MigrationGate adapters={MIGRATION_ADAPTERS} />;
}

export default MigrationGateHost;
