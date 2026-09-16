"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { track } from "@/lib/analytics/mixpanel";
import { isUnconfigured } from "@/lib/api/envelope";
import { formatUsd } from "@/lib/currency";
import { scheduleSettlement, sumValueUsd } from "@/lib/migration/schedule";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";
import { linkLegacyAccount } from "@/features/migrate/lib/api";
import { ethPriceFromPortfolio } from "@/features/migrate/lib/discover";
import type { RunResult } from "@/features/migrate/lib/run";
import {
  byVenue,
  defaultOptIn,
  reasonKey,
  reviewGroups,
  VENUE_ORDER,
  worthShowing,
} from "@/features/migrate/lib/review";
import { markFundsMoved, markMigrationComplete } from "@/features/migrate/lib/visibility";
import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";
import { useFreshLegacySession } from "@/features/migrate/hooks/use-fresh-legacy-session";
import {
  MIGRATION_QUERY_PREFIX,
  useLegacyHoldings,
} from "@/features/migrate/hooks/use-legacy-holdings";
import { useMigrationRun } from "@/features/migrate/hooks/use-migration-run";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";

export type MigrationEntry = "balance_card" | "account_modal" | "gate";

/** What a host needs to decide whether the user may leave. */
export interface MigrationProgress {
  /** The pairing exists — this run linked it, or the service already had it. */
  linked: boolean;
  /** Discovery has answered at least once; before that `remaining` is unknown. */
  discovered: boolean;
  /** Holdings still on the old side after the automatic run. */
  remaining: number;
}

export interface MoveOldMoneyPanelProps {
  adapters: readonly VenueAdapter[];
  entry: MigrationEntry;
  onClose: () => void;
  /**
   * Gate mode: hides every "leave without finishing" affordance. The host
   * owns the exit and says through `canFinish` when it is allowed.
   */
  locked?: boolean;
  canFinish?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
}

const PRIMARY =
  "bg-accent/15 border-accent/40 hover:bg-accent/25 w-full cursor-pointer rounded-xl border px-4 py-3 font-sans text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "w-full cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

// The automatic run opts into nothing: everything it moves is deterministic.
const NO_OPT_IN: ReadonlySet<string> = new Set();

// The full migration flow: sign in to the old account, review what it still
// holds everywhere, run the settlement, read the summary. Must render inside
// LegacyPrivyProvider; the sheet and the balance-card button each provide
// their own.
export function MoveOldMoneyPanel({
  adapters,
  entry,
  onClose,
  locked = false,
  canFinish = true,
  onProgress,
}: MoveOldMoneyPanelProps) {
  const t = useTranslations("migrate");
  const locale = useLocale();
  const privy = usePrivy();
  const signer = useLegacySigner();
  // Same boolean the signer gates on; the sign-in button must not be live
  // while an inherited session is still being cleared away.
  const fresh = useFreshLegacySession();
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
  // The deterministic sweep that runs without being asked for, kept apart from
  // the opted-in run so the summary can add the two together.
  const [autoResult, setAutoResult] = useState<RunResult | null>(null);

  useEffect(() => {
    track("migration_started", { entry });
  }, [entry]);

  // Link the two accounts the moment the old sign-in lands. Idempotent
  // upstream, so every opening may post it; a service that is not deployed
  // yet is simply not there.
  const linked = useRef(false);
  // Set only by a successful link, never by starting one. The device flag
  // below must not be written on a sweep whose link failed — that is exactly
  // how a device ends up "done" for an account the service never mapped.
  const linkLanded = useRef(false);
  useEffect(() => {
    if (!signer || linked.current) return;
    linked.current = true;
    linkLegacyAccount()
      .then(() => {
        linkLanded.current = true;
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
  // What the automatic run settled drops out of the review; what it failed
  // stays, so the button below can retry it.
  const remaining = useMemo(
    () => (autoResult ? holdings.filter((h) => !autoResult.results.get(h.id)?.ok) : holdings),
    [holdings, autoResult]
  );
  // Tell the host where things stand. `linkLanded` is a ref, but a landed link
  // refetches the status, which is a dep here, so the report catches up.
  const serverLinked = status.data?.linked === true;
  const discovered = holdingsQuery.dataUpdatedAt > 0;
  useEffect(() => {
    onProgress?.({
      linked: serverLinked || linkLanded.current,
      discovered,
      remaining: remaining.length,
    });
  }, [onProgress, serverLinked, discovered, remaining.length]);
  const checked = optIn ?? defaultOptIn(remaining);
  const groups = useMemo(() => reviewGroups(remaining, checked, now), [remaining, checked, now]);

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOptIn(next);
  };

  const execute = useCallback(
    async (opted: ReadonlySet<string>): Promise<RunResult> => {
      setConfirming(false);
      const plan = scheduleSettlement(remaining, opted, now);
      console.log(
        `[migrate] moving: ${plan.phases.map((ph) => `${ph.phase}(${ph.holdings.length})`).join(" -> ") || "nothing"}` +
          `, worth $${sumValueUsd(plan.phases.flatMap((ph) => ph.holdings)).toFixed(2)}` +
          `${plan.settleLater.length ? `, ${plan.settleLater.length} left for later` : ""}`
      );
      track("migration_reviewed", {
        holdings: remaining.length,
        opted_in: opted.size,
        settle_later: plan.settleLater.length,
        value_usd: sumValueUsd(plan.phases.flatMap((p) => p.holdings)),
      });
      const outcome = await runner.run(plan);
      console.log(
        `[migrate] moved: ${outcome.outcome}, $${outcome.movedUsd.toFixed(2)} across ${outcome.movedCount} item(s)`
      );
      track("migration_completed", { outcome: outcome.outcome, moved_usd: outcome.movedUsd });
      if (outcome.outcome === "complete" && (linkLanded.current || serverLinked)) {
        markMigrationComplete();
      }
      // Anything that landed is the user's money in their new wallet, so it
      // stops being hidden even when the run as a whole is unfinished.
      if (outcome.movedCount > 0) markFundsMoved();
      void newPortfolio.refetchUntilChanged("all");
      return outcome;
    },
    [remaining, now, runner, newPortfolio, serverLinked]
  );

  // A plain transfer carries no decision, so it no longer waits for one: the
  // deterministic group is swept the moment discovery lands. What survives to
  // the review is only what realises a price — closing a position, selling
  // shares — which is the only thing worth stopping a user for. A sweep that
  // fails stays in the review, so the button is still the way to retry it.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !signer || holdingsQuery.isFetching) return;
    if (groups.automatic.length === 0) return;
    autoRan.current = true;
    void (async () => {
      // Resolves only once the sweep has been signed and mined, so this lands
      // as an async callback, not a cascading render.
      setAutoResult(await execute(NO_OPT_IN));
    })();
  }, [signer, holdingsQuery.isFetching, groups.automatic.length, execute]);

  const start = () => {
    const risky = groups.optIn.some((h) => h.irreversible && checked.has(h.id));
    if (risky) setConfirming(true);
    else void execute(checked).then(setResult);
  };

  const retry = () => {
    setResult(null);
    setAutoResult(null);
    autoRan.current = false;
    setOptIn(null);
    void holdingsQuery.refetch();
  };

  if (!signer) {
    const known = status.data?.hasLegacyFunds ? status.data.legacyFundsUsd : 0;
    // There is no signer for two unrelated reasons, and showing one screen for
    // both is what made this button do nothing: signed in to an account that
    // never had an old wallet, privy.login() returns without opening anything,
    // because Privy is already signed in. The way out is a different account,
    // so say so and offer that instead. privy.user settles with authenticated,
    // and this provider creates no wallets on login, so an account with none
    // here will not grow one.
    const signedInElsewhere = fresh && privy.authenticated && privy.user !== null;
    return (
      <Step
        title={signedInElsewhere ? t("wrongAccountTitle") : t("signInTitle")}
        body={
          signedInElsewhere
            ? t("wrongAccountBody")
            : known > 0
              ? t("signInKnown", { amount: formatUsd(known) })
              : t("signInBody")
        }
      >
        <button
          onClick={() =>
            signedInElsewhere ? void privy.logout().then(() => privy.login()) : void privy.login()
          }
          // Not merely privy.ready: between Privy being ready and the inherited
          // session being discarded, a login would be torn down by the logout
          // landing behind it — the same dead click by another route.
          disabled={!privy.ready || !fresh}
          className={PRIMARY}
        >
          {signedInElsewhere ? t("wrongAccountButton") : t("signInButton")}
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

  // The automatic run is the whole migration when nothing is left to decide;
  // otherwise the summary waits for the opted-in run and reports both.
  const finished = result ?? (autoResult && groups.optIn.length === 0 ? autoResult : null);
  if (finished) {
    const runs =
      finished === autoResult
        ? [finished]
        : ([autoResult, finished].filter(Boolean) as RunResult[]);
    // A holding retried across both runs is one row, and counts as failed only
    // if no run settled it.
    const attempted = [
      ...new Map(
        runs.flatMap((r) => r.plan.phases.flatMap((p) => p.holdings)).map((h) => [h.id, h])
      ).values(),
    ];
    const failed = attempted.filter((h) => !runs.some((r) => r.results.get(h.id)?.ok));
    const movedUsd = runs.reduce((sum, r) => sum + r.movedUsd, 0);
    // Counted the way the review lists them, so "1 left" never sends the user
    // looking for a row worth nothing.
    const left = finished.plan.settleLater.filter(worthShowing).length;
    return (
      <Step title={t(`summary.${finished.outcome}`)} body={t("summaryBody")}>
        <div className="ws-inset flex flex-col gap-2 p-3.5 text-[13px]">
          <Row label={t("moved")} value={formatUsd(movedUsd)} />
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
              // The last run that attempted it holds the error worth showing.
              const outcome = runs.reduce<SettleOutcome | undefined>(
                (found, r) => r.results.get(h.id) ?? found,
                undefined
              );
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
          {locked ? (
            canFinish ? (
              <button onClick={onClose} className={PRIMARY}>
                {t("gateFinish")}
              </button>
            ) : (
              <p className="text-[13.5px] text-white/60">{t("gateNotDone")}</p>
            )
          ) : (
            <button onClick={onClose} className={SECONDARY}>
              {t("done")}
            </button>
          )}
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
  // "Polymarket and Perpetuals" in the reader's own language.
  const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  const nothing = groups.automatic.length === 0 && groups.optIn.length === 0;
  const optedIrreversible = groups.optIn.filter((h) => h.irreversible && checked.has(h.id));
  // Display only. The opt-in list is deliberately not filtered: a row the user
  // is being asked to decide about never vanishes for being worth little.
  const shownAutomatic = groups.automatic.filter(worthShowing);
  const shownLater = groups.later.filter(worthShowing);
  const shownSkipped = groups.skipped.filter(worthShowing);

  return (
    <Step title={t("reviewTitle")} body={t("reviewBody")}>
      {failures.length > 0 ? (
        // Deliberately not styled as an error, and deliberately without the
        // underlying message. A venue that did not answer says nothing about
        // the user's money, and the raw text ("Not found", "wallet is not
        // connected") reads like loss to someone who is already nervous about
        // moving funds. discover() has already logged the real error.
        <div className="mb-4 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
          <div className="text-[12.5px] font-semibold text-white/85">{t("pendingTitle")}</div>
          <p className="mt-1 text-[12px] leading-normal text-white/55">
            {t("pendingBody", {
              places: listFormat.format(failures.map((f) => t(`venue.${f.venue}`))),
            })}
          </p>
        </div>
      ) : null}
      {autoResult && autoResult.movedUsd > 0 ? (
        <div className="border-accent/25 bg-accent/8 mb-4 rounded-xl border px-3 py-2.5 text-[12.5px] text-white/75">
          {t("autoMoved", { amount: formatUsd(autoResult.movedUsd) })}
        </div>
      ) : null}
      <Section title={t("automaticHeading")} holdings={shownAutomatic} t={t} />
      <Section
        title={t("optInHeading")}
        holdings={groups.optIn}
        t={t}
        checked={checked}
        onToggle={toggle}
      />
      <Section title={t("laterHeading")} holdings={shownLater} t={t} showReason />
      <Section title={t("skippedHeading")} holdings={shownSkipped} t={t} showReason />
      {nothing && shownLater.length === 0 && shownSkipped.length === 0 ? (
        <p className="text-[13.5px] text-white/60">{t("nothingToMove")}</p>
      ) : null}
      <div className="mt-5 grid gap-2.5">
        <button onClick={start} disabled={nothing} className={PRIMARY}>
          {t("moveButton", { amount: formatUsd(groups.movingUsd) })}
        </button>
        {locked ? null : (
          <button onClick={onClose} className={SECONDARY}>
            {t("close")}
          </button>
        )}
      </div>
      {confirming ? (
        <ConfirmDialog
          open
          title={t("confirmTitle")}
          rows={optedIrreversible.map((h) => ({ label: h.label, value: formatUsd(h.valueUsd) }))}
          warning={t("confirmWarning")}
          cancelLabel={t("cancel")}
          continueLabel={t("confirmContinue")}
          onCancel={() => setConfirming(false)}
          onContinue={() => void execute(checked).then(setResult)}
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
