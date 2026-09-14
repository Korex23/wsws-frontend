"use client";

import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";
import { createServiceClient } from "@/lib/api/service";
import { resolveAuthTokens } from "@/lib/auth-token";
import { LegacySessionError } from "@/lib/errors";
import type { LegacyAddresses } from "@/lib/migration/types";

const migration = createServiceClient("/api/migration", "The migration service is unavailable.");

export type RekeyState = "done" | "pending" | "failed" | "none";

// What the service knows about the signed-in account's old wallet. Empty
// (not linked, nothing known) until the account is linked or while the
// service is not deployed; the flow works from the on-chain venues either way.
export interface MigrationStatus {
  linked: boolean;
  legacy: LegacyAddresses | null;
  hasLegacyFunds: boolean;
  legacyFundsUsd: number;
  pendingOnramps: string[];
  rekey: Record<string, RekeyState>;
}

export interface MigrationLink {
  linked: boolean;
  legacy: LegacyAddresses;
  current: LegacyAddresses;
  rekey: Record<string, RekeyState>;
  linkedAt: string;
}

export const EMPTY_MIGRATION_STATUS: MigrationStatus = {
  linked: false,
  legacy: null,
  hasLegacyFunds: false,
  legacyFundsUsd: 0,
  pendingOnramps: [],
  rekey: {},
};

export function getMigrationStatus(): Promise<MigrationStatus> {
  return migration.authedGet<MigrationStatus>("/status");
}

// Links the old account to the current one. The current bearer goes in the
// usual place; the OLD identity's tokens ride in their own headers, so the
// service sees both sides of the link in one request.
export async function linkLegacyAccount(): Promise<MigrationLink> {
  const legacy = await resolveAuthTokens("legacy");
  if (!legacy.accessToken) throw new LegacySessionError();
  const headers: Record<string, string> = {
    "x-legacy-authorization": `Bearer ${legacy.accessToken}`,
  };
  if (legacy.idToken) headers["privy-id-token"] = legacy.idToken;
  const res = await apiFetch(
    "/api/migration/link",
    { method: "POST", headers },
    { requireAuth: true }
  );
  return unwrap<MigrationLink>(res, "Couldn't link your old account.");
}
