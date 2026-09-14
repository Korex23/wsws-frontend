"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { MemeActivityRow } from "@/features/portfolio/components/meme-activity-row";
import { MemePositionRow } from "@/features/portfolio/components/meme-position-row";
import {
  useMemeActivity,
  useMemePortfolio,
  useMemePortfolioSummary,
  type PagedList,
} from "@/features/portfolio/hooks/use-meme-portfolio";
import { positionsForTab, toneClass } from "@/features/portfolio/lib/meme-positions";
import { formatPercentPoints, formatUsdString } from "@/lib/meme/decimal";
import type { MemeToken, PortfolioChain, PortfolioPosition } from "@/lib/meme/types";

type Tab = "open" | "closed" | "activity" | "base" | "solana";
const TABS: readonly Tab[] = ["open", "closed", "activity", "base", "solana"];
const TAB_LABEL = {
  open: "tabOpen",
  closed: "tabClosed",
  activity: "tabActivity",
  base: "tabBase",
  solana: "tabSolana",
} as const;

// How often the market-data ages re-read the clock, so "14 min ago" turns
// "stale" on its own while the section sits open.
const CLOCK_TICK_MS = 30_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function PartialBadge() {
  const t = useTranslations("memePositions");
  return (
    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
      {t("partialBadge")}
    </span>
  );
}

function ErrorLine({ message, onRetry }: { message: string; onRetry: () => unknown }) {
  const t = useTranslations("memePositions");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/6 px-6 py-8 text-center text-[13px] text-white/55">
      <span>{message}</span>
      <button
        type="button"
        onClick={() => onRetry()}
        className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/80 hover:text-white"
      >
        {t("retry")}
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center gap-3 border-t border-white/6 px-4 py-3.5 sm:px-6"
        >
          <span className="size-9 shrink-0 animate-pulse rounded-[11px] bg-white/8" />
          <span className="min-w-0 flex-1">
            <SkeletonLine width="w-20" />
            <SkeletonLine width="w-32" />
          </span>
          <SkeletonLine width="w-16" />
        </div>
      ))}
    </div>
  );
}

// The server's paging, kept: how many of the total are in hand, and "Load
// more" until page * limit covers it.
function Paging<T>({ list }: { list: PagedList<T> }) {
  const t = useTranslations("memePositions");
  if (list.total === null || list.total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-4 py-3 sm:px-6">
      <span className="text-[12px] text-white/45">
        {list.loadMoreFailed
          ? t("loadMoreFailed")
          : t("shownOf", { shown: list.items.length, total: list.total })}
      </span>
      {list.hasMore ? (
        <button
          type="button"
          onClick={list.loadMore}
          disabled={list.isLoadingMore}
          className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/80 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {list.isLoadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

function SummaryStrip() {
  const t = useTranslations("memePositions");
  const locale = useLocale();
  const { summary, isLoading, error, refetch } = useMemePortfolioSummary();

  if (isLoading) {
    return (
      <div aria-busy="true" className="grid grid-cols-2 gap-4 px-4 pb-4 sm:px-6 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonLine key={i} width="w-24" />
        ))}
      </div>
    );
  }
  if (!summary) {
    return error ? <ErrorLine message={t("summaryError")} onRetry={refetch} /> : null;
  }

  const partial = !summary.marketValueComplete;
  const totalReturn = formatPercentPoints(summary.totalReturnPercent);
  const calculatedAt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(summary.calculatedAt));

  return (
    <section
      aria-label={t("summaryLabel")}
      className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-4 sm:px-6 md:grid-cols-4"
    >
      <div className="min-w-0">
        <div className="text-[11.5px] tracking-[0.04em] text-white/40 uppercase">
          {t("summaryValue")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tnum font-sans text-[18px] font-medium">
            {formatUsdString(summary.currentValueUsd) ?? "—"}
          </span>
          {partial ? <PartialBadge /> : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] tracking-[0.04em] text-white/40 uppercase">
          {t("summaryTotalPnl")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`tnum font-sans text-[18px] font-medium ${toneClass(summary.totalPnlUsd)}`}
          >
            {formatUsdString(summary.totalPnlUsd, { signed: true }) ?? "—"}
          </span>
          {partial ? <PartialBadge /> : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] tracking-[0.04em] text-white/40 uppercase">
          {t("summaryReturn")}
        </div>
        {totalReturn ? (
          <span
            className={`tnum font-sans text-[18px] font-medium ${toneClass(summary.totalReturnPercent)}`}
          >
            {totalReturn}
          </span>
        ) : (
          <span className="font-sans text-[18px] text-white/50">—</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11.5px] tracking-[0.04em] text-white/40 uppercase">
          {t("summaryRealized")}
        </div>
        <span
          className={`tnum font-sans text-[18px] font-medium ${toneClass(summary.realizedPnlUsd)}`}
        >
          {formatUsdString(summary.realizedPnlUsd, { signed: true }) ?? "—"}
        </span>
      </div>
      <div className="col-span-2 text-[11.5px] text-white/40 md:col-span-4">
        {t("summaryAsOf", { time: calculatedAt })}
      </div>
    </section>
  );
}

interface PositionsPanelProps {
  chain?: PortfolioChain;
  status: PortfolioPosition["positionStatus"] | null;
  emptyText: string;
  now: number;
  onSell: (token: MemeToken) => void;
}

// A positions tab. Mounted only while its tab is selected, so an unopened tab
// never asks the service for anything.
function PositionsPanel({ chain, status, emptyText, now, onSell }: PositionsPanelProps) {
  const t = useTranslations("memePositions");
  const list = useMemePortfolio(chain);
  const rows = positionsForTab(list.items, status);

  if (list.isLoading) return <SkeletonRows />;
  if (list.error && list.items.length === 0) {
    return <ErrorLine message={t("error")} onRetry={list.refetch} />;
  }

  // The service states its disclaimer per position; the same sentence is shown
  // once under the list rather than repeated on every row.
  const disclaimers = [...new Set(rows.map((p) => p.valuationDisclaimer).filter(Boolean))];

  return (
    <>
      {rows.length === 0 ? (
        <p className="border-t border-white/6 px-6 py-8 text-center text-[13px] text-white/45">
          {emptyText}
        </p>
      ) : (
        <ul>
          {rows.map((position) => (
            <MemePositionRow
              key={`${position.chainId}:${position.address}`}
              position={position}
              now={now}
              onSell={onSell}
            />
          ))}
        </ul>
      )}
      <Paging list={list} />
      {disclaimers.length > 0 ? (
        <div className="border-t border-white/6 px-4 py-3 sm:px-6">
          {disclaimers.map((line) => (
            <p key={line} className="text-[11px] text-white/40">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ActivityPanel() {
  const t = useTranslations("memePositions");
  const list = useMemeActivity();

  if (list.isLoading) return <SkeletonRows />;
  if (list.error && list.items.length === 0) {
    return <ErrorLine message={t("activityError")} onRetry={list.refetch} />;
  }
  return (
    <>
      {list.items.length === 0 ? (
        <p className="border-t border-white/6 px-6 py-8 text-center text-[13px] text-white/45">
          {t("emptyActivity")}
        </p>
      ) : (
        <ul>
          {list.items.map((activity) => (
            <MemeActivityRow key={activity.id} activity={activity} />
          ))}
        </ul>
      )}
      <Paging list={list} />
    </>
  );
}

/**
 * The Memecoins section of /portfolio: what was bought through the trade
 * service, with profit and loss from the service's own ledger. A summary
 * strip, then Open · Closed · Activity · Base · Solana, each keeping the
 * server's paging. Sell hands the position, on its own chain, to whoever owns
 * the trade sheet; this feature never imports it.
 */
export function MemePositions({ onSell }: { onSell: (token: MemeToken) => void }) {
  const t = useTranslations("memePositions");
  const [tab, setTab] = useState<Tab>("open");
  const now = useNow(CLOCK_TICK_MS);
  const { summary } = useMemePortfolioSummary();
  const nothingYet = summary !== null && summary.totalPositions === 0;

  return (
    <div className="ws-card overflow-hidden" data-sensitive="balance">
      <div className="px-4 pt-5 pb-3 sm:px-6">
        <h2 className="ws-display text-[22px]">{t("title")}</h2>
        <p className="mt-0.5 text-[12.5px] text-white/50">{t("subtitle")}</p>
      </div>

      <SummaryStrip />

      <div
        role="tablist"
        aria-label={t("tabsLabel")}
        className="flex gap-1 overflow-x-auto border-t border-white/6 px-3 py-2 sm:px-5"
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`meme-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="meme-tab-panel"
            onClick={() => setTab(id)}
            className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tab === id ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
            }`}
          >
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="meme-tab-panel" aria-labelledby={`meme-tab-${tab}`}>
        {tab === "activity" ? (
          <ActivityPanel />
        ) : (
          <PositionsPanel
            key={tab}
            chain={tab === "base" || tab === "solana" ? tab : undefined}
            status={tab === "open" ? "OPEN" : tab === "closed" ? "CLOSED" : null}
            emptyText={
              tab === "open"
                ? nothingYet
                  ? t("emptyAll")
                  : t("emptyOpen")
                : tab === "closed"
                  ? t("emptyClosed")
                  : t("emptyChain", { chain: t(TAB_LABEL[tab]) })
            }
            now={now}
            onSell={onSell}
          />
        )}
      </div>
    </div>
  );
}
