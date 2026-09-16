"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { VenueAdapter } from "@/lib/migration/types";
import { useOfferMigration } from "@/features/migrate/hooks/use-offer-migration";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-sheet";
import { MigrationGateHeader } from "@/features/migrate/components/migration-gate-header";
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
 * The migration as a gate: an overlay nobody can close until the old account
 * is linked and its CORE money — native, the stablecoins, KSH — has crossed.
 *
 * Deliberately not "every last token". A memecoin that reverts on transfer, a
 * perp position awaiting settlement, a market awaiting resolution — none of
 * those should hold the whole app shut. They are the long tail, and the
 * account menu keeps an always-open door to them ("Move money from old
 * wallet"). The gate is for the money a user would be hurt to leave behind.
 *
 * "Core cleared" is the panel's own on-chain discovery, not the service's
 * flag, which also fires while a ledger re-key is pending — a backend queue
 * the user cannot act on.
 */
export function MigrationGate({ adapters }: { adapters: readonly VenueAdapter[] }) {
  const t = useTranslations("migrate");
  const offer = useOfferMigration();
  const session = useAuthSession();
  const key = gateKey(session.evmAddress);
  const [doneHere, setDoneHere] = useState(() => readGateDone(key));
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  const canFinish =
    progress !== null && progress.linked && progress.discovered && progress.coreRemaining === 0;

  const finish = useCallback(() => {
    if (!canFinish) return;
    writeGateDone(key);
    setDoneHere(true);
  }, [canFinish, key]);

  const ignore = useCallback(() => {}, []);

  if (!offer || doneHere) return null;
  const coreLeft = progress?.linked === true && !canFinish;
  return (
    <MoveOldMoneyFrame dismissible={false} onClose={ignore}>
      <LegacyPrivyProvider>
        <MigrationGateHeader stage={progress?.stage ?? "signIn"} done={canFinish} />
        <MoveOldMoneyPanel
          adapters={adapters}
          entry="gate"
          locked
          onProgress={setProgress}
          onClose={finish}
        />
        {(canFinish || coreLeft) && (
          <div className="mt-5 border-t border-white/10 pt-4">
            {canFinish ? (
              <button
                onClick={finish}
                className="bg-accent/15 border-accent/40 hover:bg-accent/25 w-full cursor-pointer rounded-xl border px-4 py-3 font-sans text-[14px] font-semibold text-white"
              >
                {t("gateFinish")}
              </button>
            ) : (
              <p className="text-[13px] leading-normal text-white/55">{t("gateCoreLeft")}</p>
            )}
          </div>
        )}
      </LegacyPrivyProvider>
    </MoveOldMoneyFrame>
  );
}
