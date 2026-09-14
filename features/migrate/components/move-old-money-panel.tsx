"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { track } from "@/lib/analytics/mixpanel";
import { isUnconfigured } from "@/lib/api/envelope";
import { formatUsd } from "@/lib/currency";
import { scheduleSettlement } from "@/lib/migration/schedule";
import type { LegacyHolding, VenueAdapter } from "@/lib/migration/types";
import { linkLegacyAccount } from "@/features/migrate/lib/api";
import { ethPriceFromPortfolio } from "@/features/migrate/lib/discover";
import type { RunResult } from "@/features/migrate/lib/run";
import {
  byVenue,
  defaultOptIn,
  reasonKey,
  reviewGroups,
  VENUE_ORDER,
} from "@/features/migrate/lib/review";
import { markFundsMoved, markMigrationComplete } from "@/features/migrate/lib/visibility";
import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";
import {
  MIGRATION_QUERY_PREFIX,
  useLegacyHoldings,
} from "@/features/migrate/hooks/use-legacy-holdings";
import { useMigrationRun } from "@/features/migrate/hooks/use-migration-run";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";

export type MigrationEntry = "balance_card" | "account_modal";

export interface MoveOldMoneyPanelProps {
  adapters: readonly VenueAdapter[];
  entry: MigrationEntry;
  onClose: () => void;
}

const PRIMARY =
  "bg-accent/15 border-accent/40 hover:bg-accent/25 w-full cursor-pointer rounded-xl border px-4 py-3 font-sans text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "w-full cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

// The full migration flow: sign in to the old account, review what it still
// holds everywhere, run the settlement, read the summary. Must render inside
// LegacyPrivyProvider; the sheet and the balance-card button each provide
// their own.
export function MoveOldMoneyPanel({ adapters, entry, onClose }: MoveOldMoneyPanelProps) {
  const t = useTranslations("migrate");
  const privy = usePrivy();
  const signer = useLegacySigner();
  const session = useAuthSession();
  const newPortfolio = usePortfolio();
  const queryClient = useQueryClient();

  const status = useMigrationStatus();
  const refetchStatus = status.refetch;

  const ethPriceUsd = ethPriceFromPortfolio(newPortfolio.tokens);
  // Before the old sign-in, a linked account's addresses come from the
  // server, so a fresh device can already see the on-chain venues.
  const serverLegacy = status.data?.legacy ?? null;
  const legacy = useMemo(
    () => signer?.addresses ?? serverLegacy ?? { evm: null, solana: null },
    [signer, serverLegacy]
  );
  const current = useMemo(
    () => ({ evm: session.evmAddress, solana: session.solanaAddress }),
    [session.evmAddress, session.solanaAddress]
  );
  const runnerInput = { adapters, legacy, current, signer, ethPriceUsd };
  const holdingsQuery = useLegacyHoldings(runnerInput);
  const runner = useMigrationRun(runnerInput);

  // Null until the user touches a checkbox; the defaults apply until then and
  // reset with every re-discovery.
  const [optIn, setOptIn] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    track("migration_started", { entry });
  }, [entry]);

  // Link the two accounts the moment the old sign-in lands. Idempotent
  // upstream, so every opening may post it; a service that is not deployed
  // yet is simply not there.
  const linked = useRef(false);
  useEffect(() => {
    if (!signer || linked.current) return;
    linked.current = true;
    linkLegacyAccount()
      .then(() => {
        track("migration_linked");
        void refetchStatus();
      })
      .catch((error: unknown) => {
        if (!isUnconfigured(error)) console.error("Linking the old account failed", error);
      });
  }, [signer, refetchStatus]);

  // Old-identity data never outlives the panel.
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: MIGRATION_QUERY_PREFIX });
    },
    [queryClient]
  );

  const holdings = useMemo(
    () => holdingsQuery.data?.holdings ?? [],
    [holdingsQuery.data?.holdings]
  );
  // Settleability is judged as of discovery; before the first discovery there
  // are no holdings to judge.
  const now = holdingsQuery.dataUpdatedAt;
  const checked = optIn ?? defaultOptIn(holdings);
  const groups = useMemo(() => reviewGroups(holdings, checked, now), [holdings, checked, now]);

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOptIn(next);
  };

  const execute = useCallback(async () => {
    setConfirming(false);
    const plan = scheduleSettlement(holdings, checked, now);
    track("migration_reviewed", {
      holdings: holdings.length,
      opted_in: checked.size,
      settle_later: plan.settleLater.length,
      value_usd: groups.movingUsd,
    });
    const outcome = await runner.run(plan);
    setResult(outcome);
    track("migration_completed", { outcome: outcome.outcome, moved_usd: outcome.movedUsd });
    if (outcome.outcome === "complete") markMigrationComplete();
    // Anything that landed is the user's money in their new wallet, so it
    // stops being hidden even when the run as a whole is unfinished.
    if (outcome.movedCount > 0) markFundsMoved();
    void newPortfolio.refetchUntilChanged("all");
  }, [holdings, checked, now, groups.movingUsd, runner, newPortfolio]);

  const start = () => {
    const risky = groups.optIn.some((h) => h.irreversible && checked.has(h.id));
    if (risky) setConfirming(true);
    else void execute();
  };

  const retry = () => {
    setResult(null);
    setOptIn(null);
    void holdingsQuery.refetch();
  };

  if (!signer) {
    const known = status.data?.hasLegacyFunds ? status.data.legacyFundsUsd : 0;
    return (
      <Step
        title={t("signInTitle")}
        body={known > 0 ? t("signInKnown", { amount: formatUsd(known) }) : t("signInBody")}
      >
        <button onClick={() => privy.login()} disabled={!privy.ready} className={PRIMARY}>
          {t("signInButton")}
        </button>
      </Step>
    );
  }

  if (runner.running && runner.progress) {
    const { done, total, message } = runner.progress;
    return (
      <Step title={t("runningTitle")} body={message || t("runningBody")}>
        <ProgressBar pct={total === 0 ? 0 : Math.round((done / total) * 100)} />
        <p className="tnum mt-2 text-[12.5px] text-white/55">
          {t("runningCount", { done, total })}
        </p>
        <button onClick={runner.cancel} className={`${SECONDARY} mt-4`}>
          {t("cancelRun")}
        </button>
      </Step>
    );
  }

  if (result) {
    const attempted = result.plan.phases.flatMap((p) => p.holdings);
    const failed = attempted.filter((h) => !result.results.get(h.id)?.ok);
    const left = result.plan.settleLater.length;
    return (
      <Step title={t(`summary.${result.outcome}`)} body={t("summaryBody")}>
        <div className="ws-inset flex flex-col gap-2 p-3.5 text-[13px]">
          <Row label={t("moved")} value={formatUsd(result.movedUsd)} />
          <Row label={t("left")} value={String(left)} />
          <Row
            label={t("failed")}
            value={String(failed.length)}
            tone={failed.length ? "down" : undefined}
          />
        </div>
        {failed.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-white/60">
            {failed.map((h) => {
              const outcome = result.results.get(h.id);
              return (
                <li key={h.id}>
                  <span className="text-white/85">{h.label}</span>:{" "}
                  {outcome && !outcome.ok ? shortError(outcome.error) : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-4 grid gap-2.5">
          {failed.length > 0 || left > 0 ? (
            <button onClick={retry} className={PRIMARY}>
              {t("retry")}
            </button>
          ) : null}
          <button onClick={onClose} className={SECONDARY}>
            {t("done")}
          </button>
        </div>
      </Step>
    );
  }

  if (holdingsQuery.isPending) {
    return <Step title={t("reviewTitle")} body={t("checking")} />;
  }
  if (holdingsQuery.isError) {
    return (
      <Step title={t("reviewTitle")} body={t("checkFailed")}>
        <button onClick={() => void holdingsQuery.refetch()} className={PRIMARY}>
          {t("retry")}
        </button>
      </Step>
    );
  }

  const failures = holdingsQuery.data?.failures ?? [];
  const nothing = groups.automatic.length === 0 && groups.optIn.length === 0;
  const optedIrreversible = groups.optIn.filter((h) => h.irreversible && checked.has(h.id));

  return (
    <Step title={t("reviewTitle")} body={t("reviewBody")}>
      {failures.length > 0 ? (
        <div className="border-down/25 bg-down/8 mb-4 rounded-xl border px-3 py-2.5">
          <div className="text-down text-[12.5px] font-semibold">{t("discoveryFailedTitle")}</div>
          <ul className="mt-1 flex flex-col gap-1 text-[12px] text-white/60">
            {failures.map((failure) => (
              <li key={failure.venue}>
                <span className="text-white/85">{t(`venue.${failure.venue}`)}</span>:{" "}
                {shortError(failure.error)}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-white/50">{t("discoveryFailedHint")}</p>
        </div>
      ) : null}
      <Section title={t("automaticHeading")} holdings={groups.automatic} t={t} />
      <Section
        title={t("optInHeading")}
        holdings={groups.optIn}
        t={t}
        checked={checked}
        onToggle={toggle}
      />
      <Section title={t("laterHeading")} holdings={groups.later} t={t} showReason />
      <Section title={t("skippedHeading")} holdings={groups.skipped} t={t} showReason />
      {nothing && groups.later.length === 0 && groups.skipped.length === 0 ? (
        <p className="text-[13.5px] text-white/60">{t("nothingToMove")}</p>
      ) : null}
      <div className="mt-5 grid gap-2.5">
        <button onClick={start} disabled={nothing} className={PRIMARY}>
          {t("moveButton", { amount: formatUsd(groups.movingUsd) })}
        </button>
        <button onClick={onClose} className={SECONDARY}>
          {t("close")}
        </button>
      </div>
      {confirming ? (
        <ConfirmDialog
          title={t("confirmTitle")}
          rows={optedIrreversible.map((h) => ({ label: h.label, value: formatUsd(h.valueUsd) }))}
          warning={t("confirmWarning")}
          cancelLabel={t("cancel")}
          continueLabel={t("confirmContinue")}
          onCancel={() => setConfirming(false)}
          onContinue={() => void execute()}
        />
      ) : null}
    </Step>
  );
}

function Step({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="ws-display text-[22px] tracking-[-0.01em] md:text-[24px]">{title}</div>
      <p className="mt-1.5 mb-4 text-[13.5px] leading-normal text-white/60">{body}</p>
      {children}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "down" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/55">{label}</span>
      <span className={`tnum font-medium ${tone === "down" ? "text-down" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

// The first line of an error, capped. Library errors (viem especially) append
// a docs link and a version banner that are noise on a review screen; the
// console still has the whole thing.
function shortError(message: string): string {
  const first = message.split("\n")[0].trim();
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

type Translate = ReturnType<typeof useTranslations<"migrate">>;

function Section({
  title,
  holdings,
  t,
  checked,
  onToggle,
  showReason,
}: {
  title: string;
  holdings: LegacyHolding[];
  t: Translate;
  checked?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  showReason?: boolean;
}) {
  if (holdings.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-white/45 uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {byVenue(holdings, VENUE_ORDER).map((group) => (
          <div key={group.venue}>
            <div className="mb-1 text-[12px] text-white/50">{t(`venue.${group.venue}`)}</div>
            {group.holdings.map((h) => {
              const reason = showReason ? reasonKey(h.settleability) : null;
              const isChecked = checked?.has(h.id) ?? false;
              const row = (
                <>
                  {onToggle ? (
                    <span
                      aria-hidden
                      className={`grid size-5 shrink-0 place-items-center rounded-[6px] border ${
                        isChecked ? "border-accent bg-accent/30 text-white" : "border-white/25"
                      }`}
                    >
                      {isChecked ? <CheckIcon size={12} /> : null}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-white/90">{h.label}</span>
                    {reason ? (
                      <span className="block text-[12px] text-white/50">
                        {t(`reason.${reason}`)}
                      </span>
                    ) : null}
                    {onToggle && h.irreversible ? (
                      <span className="block text-[12px] text-white/50">
                        {t("irreversibleWarning")}
                      </span>
                    ) : null}
                  </span>
                  <span className="tnum shrink-0 text-[13.5px] font-medium text-white">
                    {formatUsd(h.valueUsd)}
                  </span>
                </>
              );
              const className =
                "flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-left";
              return onToggle ? (
                <button
                  key={h.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  onClick={() => onToggle(h.id)}
                  className={`${className} cursor-pointer hover:bg-white/8`}
                >
                  {row}
                </button>
              ) : (
                <div key={h.id} className={className}>
                  {row}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
