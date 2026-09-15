"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";
import { RefreshIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { toast } from "@/lib/toast";
import { scheduleSettlement } from "@/lib/migration/schedule";
import type { LegacyHolding, VenueAdapter } from "@/lib/migration/types";
import { discoverHoldings, ethPriceFromPortfolio } from "@/features/migrate/lib/discover";
import { markFundsMoved, markMigrationComplete } from "@/features/migrate/lib/visibility";
import { useOfferMigration } from "@/features/migrate/hooks/use-offer-migration";
import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";
import { legacyHoldingsKey } from "@/features/migrate/hooks/use-legacy-holdings";
import { useMigrationRun } from "@/features/migrate/hooks/use-migration-run";
import { MoveOldMoneyPanel } from "@/features/migrate/components/move-old-money-panel";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-sheet";

/**
 * A holding that can simply be moved, with nothing for the user to decide.
 *
 * `deterministic: false` means the action realises a loss or a price, and
 * `irreversible` means it closes a trade or sells into a book — a prediction
 * position or a perps trade is one or both. Neither is something to do to
 * someone's money on their behalf, so both go to review; a plain wallet balance
 * is neither, and just moves.
 */
function isPlainTransfer(h: LegacyHolding): boolean {
  return h.venue === "wallet" && h.deterministic && !h.irreversible;
}

// The one-click migration. Sits between Add funds and Withdraw on the balance
// card for users whose money still lives in their old Privy wallets: one tap
// signs in to the old account if needed and moves every plain balance to the
// new Decane wallets (gas sponsored).
//
// Money inside a venue does not block that. The plain balances are swept on the
// same tap, and the review opens afterwards for whatever genuinely needs a
// decision — so a position never holds an ordinary transfer hostage. It retires
// itself when nothing is left anywhere.
export function UpdateBalanceButton({ adapters }: { adapters: readonly VenueAdapter[] }) {
  const offer = useOfferMigration();
  // Mounting Privy is not free and writes its own storage; only devices with
  // an unfinished migration ever load it here.
  if (!offer) return null;
  return (
    <LegacyPrivyProvider>
      <UpdateBalanceInner adapters={adapters} />
    </LegacyPrivyProvider>
  );
}

function UpdateBalanceInner({ adapters }: { adapters: readonly VenueAdapter[] }) {
  const t = useTranslations("migrate");
  const privy = usePrivy();
  const signer = useLegacySigner();
  const session = useAuthSession();
  const newPortfolio = usePortfolio();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Set when the click had to detour through the Privy login modal first; the
  // effect below resumes the update the moment that session lands.
  const resumeAfterLogin = useRef(false);

  const ethPriceUsd = ethPriceFromPortfolio(newPortfolio.tokens);
  const legacy = useMemo(() => signer?.addresses ?? { evm: null, solana: null }, [signer]);
  const current = useMemo(
    () => ({ evm: session.evmAddress, solana: session.solanaAddress }),
    [session.evmAddress, session.solanaAddress]
  );
  const runner = useMigrationRun({ adapters, legacy, current, signer, ethPriceUsd });

  const run = useCallback(async () => {
    if (!signer || !current.evm || !current.solana) {
      toast.error(t("updateNotReady"));
      return;
    }
    setBusy(true);
    const toastId = toast.loading(t("updating"));
    try {
      const ctx = { legacy, current, hasLegacySession: true, signer, ethPriceUsd };
      const discovered = await discoverHoldings(adapters, ctx);
      // Split by whether a human is genuinely needed. A plain wallet balance
      // has no price to realise and nothing to warn about, so asking about it
      // is a speed bump; a prediction position or a perps trade realises a
      // price, and that is what the review screen is for.
      //
      // Previously ONE reviewable holding sent everything to review and moved
      // nothing — so a user with, say, USDC sitting beside an open position
      // could tap this repeatedly and watch the balance never change. The plain
      // balances now go regardless, and only the remainder is reviewed.
      const plain = discovered.holdings.filter(isPlainTransfer);
      const needsDecision = discovered.holdings.filter((h) => !isPlainTransfer(h));
      const hasReviewWork = needsDecision.length > 0 || discovered.failures.length > 0;

      const plan = scheduleSettlement(plain, new Set(), Date.now());
      const pendingOnramps = plan.settleLater.filter(
        (h) => h.settleability.state === "pending"
      ).length;

      let movedCount = 0;
      let sweepError: string | null = null;
      if (plan.phases.length > 0) {
        const result = await runner.run(plan);
        movedCount = result.movedCount;
        if (result.outcome !== "complete") {
          const firstError = [...result.results.values()].find((o) => !o.ok);
          sweepError = firstError && !firstError.ok ? firstError.error : "";
        }
      }

      // Part of it may still have landed even on failure. Unmask what arrived
      // and pull it into view before saying the rest needs another go.
      if (movedCount > 0) {
        markFundsMoved();
        void newPortfolio.refetchUntilChanged("all");
      } else {
        // Nothing moved, but the user asked for an update and deserves one.
        // A single fresh read, not refetchUntilChanged: no change is coming, so
        // waiting for one would just burn the settle deadline in silence.
        void newPortfolio.refetchFresh("all");
      }

      // Retire the button only when nothing is left anywhere: nothing to
      // review, no failed sweep, no deposit still in flight. Skipped holdings
      // sit on networks the sponsor does not cover and keeping the button
      // forever would not change that, so they do not hold it open.
      if (!hasReviewWork && sweepError === null && pendingOnramps === 0) {
        markMigrationComplete();
      }

      if (sweepError !== null) {
        toast.error(t("updateFailed", { message: sweepError }), { id: toastId });
      } else if (movedCount > 0) {
        toast.success(
          plan.skipped.length > 0
            ? t("updateSkipped", { count: plan.skipped.length })
            : t("updateDone"),
          { id: toastId }
        );
      } else if (!hasReviewWork) {
        toast.success(
          plan.skipped.length > 0
            ? t("updateSkipped", { count: plan.skipped.length })
            : t("updateNothing"),
          { id: toastId }
        );
      } else {
        // The review is about to open and speaks for itself.
        toast.dismiss(toastId);
      }

      if (hasReviewWork) {
        // Seed the review with what is actually left. A failed sweep leaves the
        // plain balances in place too, so those go back into the list rather
        // than vanishing from a screen meant to show what remains.
        queryClient.setQueryData(legacyHoldingsKey(legacy, true), {
          ...discovered,
          holdings: sweepError !== null ? discovered.holdings : needsDecision,
        });
        setReviewOpen(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("updateNotReady"), { id: toastId });
    } finally {
      setBusy(false);
    }
  }, [signer, current, legacy, ethPriceUsd, adapters, queryClient, runner, newPortfolio, t]);

  useEffect(() => {
    if (resumeAfterLogin.current && signer) {
      resumeAfterLogin.current = false;
      void run();
    }
  }, [signer, run]);

  const click = () => {
    if (!privy.ready || busy) return;
    if (!signer) {
      resumeAfterLogin.current = true;
      privy.login();
      return;
    }
    void run();
  };

  return (
    <>
      {/* Dressed as Withdraw, because it sits in that row and a third visual
          language there reads as an advert rather than an action. One node
          renders into both cards — only one is ever visible — so the phone
          shape is the base and the desktop one arrives at md, matching
          balance-card-mobile's `action` and balance-card-desktop's pill. */}
      <button
        onClick={click}
        disabled={busy}
        className="ws-pressable flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-white bg-white/6 py-[12px] font-sans text-[15px] font-semibold tracking-[-0.15px] whitespace-nowrap text-white transition-opacity active:bg-white/12 disabled:cursor-wait disabled:opacity-40 md:gap-[8px] md:border-[1.53px] md:px-[24px] md:py-[19.88px] md:font-serif md:text-[21px] md:leading-[1.1] md:tracking-[-0.21px]"
      >
        <RefreshIcon size={15} className="shrink-0 md:size-[26.49px]" />
        {busy ? t("updating") : t("updateBalance")}
      </button>
      {reviewOpen ? (
        <MoveOldMoneyFrame onClose={() => setReviewOpen(false)}>
          <MoveOldMoneyPanel
            adapters={adapters}
            entry="balance_card"
            onClose={() => setReviewOpen(false)}
          />
        </MoveOldMoneyFrame>
      ) : null}
    </>
  );
}
