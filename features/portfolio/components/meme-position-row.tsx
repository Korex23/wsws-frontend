"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import { MemeActivityRow } from "@/features/portfolio/components/meme-activity-row";
import { useMemePosition } from "@/features/portfolio/hooks/use-meme-portfolio";
import { positionToMemeToken, toneClass } from "@/features/portfolio/lib/meme-positions";
import { networkOf } from "@/lib/meme/chain";
import { formatPercentPoints, formatQuantity, formatUsdString } from "@/lib/meme/decimal";
import { marketDataAge, type MarketDataAge } from "@/lib/meme/format";
import type { MemeToken, PortfolioPosition } from "@/lib/meme/types";
import { tokenBg } from "@/lib/trade/assets";

type Translate = ReturnType<typeof useTranslations<"memePositions">>;

function ageText(t: Translate, minutes: number): string {
  if (minutes < 1) return t("ageJustNow");
  if (minutes < 60) return t("ageMinutes", { minutes });
  if (minutes < 24 * 60) return t("ageHours", { hours: Math.floor(minutes / 60) });
  return t("ageDays", { days: Math.floor(minutes / (24 * 60)) });
}

function marketDataText(t: Translate, age: MarketDataAge): string {
  if (age.kind === "none") return t("marketDataNone");
  const text = ageText(t, age.minutes);
  return age.kind === "stale"
    ? t("marketDataStale", { age: text })
    : t("marketDataFresh", { age: text });
}

function Badge({ children, title }: { children: string; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-200"
    >
      {children}
    </span>
  );
}

// One position's confirmed trades, read when the row is expanded.
function PositionTrades({ position }: { position: PortfolioPosition }) {
  const t = useTranslations("memePositions");
  const detail = useMemePosition(position.chain, position.address);
  if (detail.isLoading) {
    return (
      <div aria-busy="true" className="px-4 py-3 sm:px-6">
        <SkeletonLine width="w-40" />
      </div>
    );
  }
  if (detail.error && !detail.position) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-[12.5px] text-white/55 sm:px-6">
        <span>{t("tradesError")}</span>
        <button
          type="button"
          onClick={() => detail.refetch()}
          className="cursor-pointer text-white/80 underline-offset-2 hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }
  const trades = detail.position?.activity ?? [];
  if (trades.length === 0) {
    return <p className="px-4 py-3 text-[12.5px] text-white/45 sm:px-6">{t("tradesEmpty")}</p>;
  }
  return (
    <ul>
      {trades.map((trade) => (
        <MemeActivityRow key={trade.id} activity={trade} />
      ))}
    </ul>
  );
}

interface MemePositionRowProps {
  position: PortfolioPosition;
  now: number;
  onSell: (token: MemeToken) => void;
}

/**
 * One service position, per the trade contract's rendering rules: a null mark
 * is "Valuation unavailable" (never $0, never -100%), a ledger-derived
 * quantity says so, a partial cost basis says why, the mark's age is shown and
 * labelled stale, P&L is coloured by sign with an explicit +. The market value
 * is labelled as a mark, not what a sale would pay: Sell opens the trade sheet,
 * which previews the proceeds before anything is confirmed.
 */
export function MemePositionRow({ position, now, onSell }: MemePositionRowProps) {
  const t = useTranslations("memePositions");
  const [showTrades, setShowTrades] = useState(false);
  const symbol = position.symbol ?? position.name ?? position.address.slice(0, 6);
  const unpriced = position.currentPriceUsd === null;
  const value = unpriced ? null : formatUsdString(position.currentValueUsd);
  const totalReturn = formatPercentPoints(position.totalReturnPercent);
  const quantity = formatQuantity(position.quantityRemaining) ?? position.quantityRemaining;
  const open = position.positionStatus === "OPEN";

  return (
    <li aria-label={symbol} className="border-t border-white/6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-2 px-4 py-3.5 sm:px-6 md:grid-cols-[minmax(0,1.6fr)_1fr_0.8fr_1fr_1fr_auto] md:items-center">
        <span className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <AssetIcon sym={symbol} bg={tokenBg(symbol)} logo={position.logoUrl} />
            <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
              <NetworkIcon network={networkOf(position.chainId) ?? "base-mainnet"} size={14} />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-sans text-[14.5px] font-medium">{symbol}</span>
            <span className="block truncate text-xs text-white/50">
              {position.chain === "solana" ? t("tabSolana") : t("tabBase")}
              {position.name && position.name !== symbol ? ` · ${position.name}` : ""}
            </span>
          </span>
        </span>

        {/* Holding */}
        <span className="col-start-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] md:col-start-auto">
          <span className="text-white/40 md:hidden">{t("colHolding")}</span>
          <span className="tnum">
            {quantity} {symbol}
          </span>
          {position.balanceStatus === "UNAVAILABLE" ? (
            <Badge title={t("ledgerDerivedHint")}>{t("ledgerDerived")}</Badge>
          ) : null}
        </span>

        {/* Average entry */}
        <span className="col-start-1 flex items-center gap-1.5 text-[13px] md:col-start-auto md:justify-end">
          <span className="text-white/40 md:hidden">{t("colEntry")}</span>
          <span className="tnum">{formatUsdString(position.averageEntryPriceUsd) ?? "—"}</span>
        </span>

        {/* Market value: a mark, with its age */}
        <span className="col-start-1 flex flex-col text-[13px] md:col-start-auto md:items-end">
          <span className="flex items-center gap-1.5">
            <span className="text-white/40 md:hidden">{t("colValue")}</span>
            {value === null ? (
              <span className="text-white/60">{t("valuationUnavailable")}</span>
            ) : (
              <span className="tnum font-medium">{value}</span>
            )}
          </span>
          <span className="text-[11.5px] text-white/45">
            {marketDataText(t, marketDataAge(position.marketDataUpdatedAt, now))}
          </span>
        </span>

        {/* Total P&L */}
        <span className="col-start-1 flex flex-col text-[13px] md:col-start-auto md:items-end">
          <span className="flex items-center gap-1.5">
            <span className="text-white/40 md:hidden">{t("colPnl")}</span>
            <span className={`tnum font-medium ${toneClass(position.totalPnlUsd)}`}>
              {formatUsdString(position.totalPnlUsd, { signed: true }) ?? "—"}
            </span>
            {totalReturn ? (
              <span className={`tnum text-[12px] ${toneClass(position.totalReturnPercent)}`}>
                {totalReturn}
              </span>
            ) : null}
          </span>
          {unpriced ? (
            <span className="text-[11.5px] text-white/45">{t("realizedOnly")}</span>
          ) : null}
        </span>

        <span className="col-start-2 row-start-1 flex items-center gap-2 md:col-start-auto md:row-start-auto md:justify-end">
          {open ? (
            <button
              type="button"
              aria-label={t("sellAria", { symbol })}
              title={position.sellEnabled ? undefined : t("sellPaused")}
              disabled={!position.sellEnabled}
              onClick={() => onSell(positionToMemeToken(position))}
              className="cursor-pointer rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[12.5px] font-medium text-white/85 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("sell")}
            </button>
          ) : null}
        </span>
      </div>

      {position.costBasisStatus === "PARTIAL" ? (
        <div className="flex flex-wrap items-start gap-2 px-4 pb-3 sm:px-6">
          <Badge>{t("costBasisPartial")}</Badge>
          <p className="min-w-0 flex-1 text-[11.5px] text-white/50">{t("costBasisPartialHint")}</p>
        </div>
      ) : null}

      <div className="px-4 pb-3 sm:px-6">
        <button
          type="button"
          aria-expanded={showTrades}
          onClick={() => setShowTrades((shown) => !shown)}
          className="cursor-pointer text-[12px] text-white/55 underline-offset-2 hover:text-white hover:underline"
        >
          {showTrades ? t("tradesHide") : t("tradesShow")}
        </button>
      </div>
      {showTrades ? <PositionTrades position={position} /> : null}
    </li>
  );
}
