"use client";

import { MigrationOAuthReturn } from "@/features/migrate/components/migration-oauth-return";
import { MIGRATION_ADAPTERS } from "@/components/layout/migration-adapters";

/**
 * The OAuth-return reopener with its adapters bound, for the session provider
 * to load behind next/dynamic.
 *
 * It renders on exactly one page load in a user's life — the one that comes
 * back from Google or X with Privy's credentials in the query string — so its
 * bytes have no business in the shell on every other load. See
 * migration-sheet-host for the same reasoning.
 */
export function MigrationOAuthReturnHost() {
  return <MigrationOAuthReturn adapters={MIGRATION_ADAPTERS} />;
}

export default MigrationOAuthReturnHost;
