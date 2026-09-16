"use client";

import { useCallback, useState } from "react";
import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { VenueAdapter } from "@/lib/migration/types";
import { useOfferMigration } from "@/features/migrate/hooks/use-offer-migration";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-sheet";
import {
  MoveOldMoneyPanel,
  type MigrationProgress,
} from "@/features/migrate/components/move-old-money-panel";

// Per ACCOUNT, not per device: the device-wide flag is what let one user's
// finish hide the migration from the next user of the same browser. Written
// only once the gate's own conditions were met, so it is never a lie.
const GATE_DONE_PREFIX = "ws.migrationGateDone:";

function gateKey(evmAddress: string | null): string | null {
  return evmAddress ? `${GATE_DONE_PREFIX}${evmAddress.toLowerCase()}` : null;
}

function readGateDone(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeGateDone(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage refused (private mode, quota): the gate simply shows once more.
  }
}

/**
 * The migration as a gate rather than a button: an overlay nobody can close
 * until the old account is linked AND nothing is left to move off it.
 *
 * "Nothing left" is the panel's own discovery, not the service's flag. The
 * service reports funds while any ledger re-key is still pending — which the
 * user cannot act on, and which sits that way for as long as a consumer is
 * down. A gate on that would lock people out of the app for a backend's sake.
 * So the exit is judged on what the user could actually move; once they have,
 * this account is marked done on this device and the gate does not return.
 */
export function MigrationGate({ adapters }: { adapters: readonly VenueAdapter[] }) {
  const offer = useOfferMigration();
  const session = useAuthSession();
  const key = gateKey(session.evmAddress);
  const [doneHere, setDoneHere] = useState(() => readGateDone(key));
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  const canFinish =
    progress !== null && progress.linked && progress.discovered && progress.remaining === 0;

  const finish = useCallback(() => {
    if (!canFinish) return;
    writeGateDone(key);
    setDoneHere(true);
  }, [canFinish, key]);

  // A locked frame gets a no-op: nothing the frame owns may close the gate.
  const ignore = useCallback(() => {}, []);

  if (!offer || doneHere) return null;
  return (
    <MoveOldMoneyFrame dismissible={false} onClose={ignore}>
      <LegacyPrivyProvider>
        <MoveOldMoneyPanel
          adapters={adapters}
          entry="gate"
          locked
          canFinish={canFinish}
          onProgress={setProgress}
          onClose={finish}
        />
      </LegacyPrivyProvider>
    </MoveOldMoneyFrame>
  );
}
