"use client";

import { useLocale, useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { activityTxHash, isPendingActivity } from "@/features/portfolio/lib/meme-positions";
import { explorerTxUrl } from "@/lib/meme/chain";
import { formatQuantity, formatUsdString } from "@/lib/meme/decimal";
import { PLATFORM_FEE_SYMBOL, formatUsdcAtomic } from "@/lib/meme/format";
import type { TradeActivity, TradeActivityStatus } from "@/lib/meme/types";
import { tokenBg } from "@/lib/trade/assets";

const STATUS_KEY: Record<TradeActivityStatus, string> = {
  AWAITING_SUBMISSION: "statusAwaitingSubmission",
  SUBMITTED: "statusSubmitted",
  CONFIRMING: "statusConfirming",
  CONFIRMED: "statusConfirmed",
  FAILED: "statusFailed",
  REVERTED: "statusReverted",
  EXPIRED: "statusExpired",
  CANCELLED: "statusCancelled",
};

function statusTone(status: TradeActivityStatus): string {
  if (status === "CONFIRMED") return "bg-up/15 text-up";
  if (status === "FAILED" || status === "REVERTED") return "bg-down/15 text-down";
  if (isPendingActivity(status)) return "bg-amber-300/15 text-amber-200";
  return "bg-white/8 text-white/60";
}

/**
 * One swap from the service's activity feed: what was sold for what, its USD
 * size, the platform fee, its status, and a link to the transaction when the
 * service has one. A pending trade says it is not in the holdings yet: the
 * portfolio counts confirmed swaps only. The service's failure wording is not
 * shown; the status says what happened.
 */
export function MemeActivityRow({ activity }: { activity: TradeActivity }) {
  const t = useTranslations("memePositions");
  const locale = useLocale();
  const symbol = activity.tokenSymbol ?? activity.tokenName ?? activity.tokenAddress.slice(0, 6);
  const buying = activity.side === "BUY";
  const side = buying ? t("sideBuy") : t("sideSell");
  const sold = formatQuantity(activity.sellAmount) ?? activity.sellAmount;
  const bought = formatQuantity(activity.buyAmount) ?? activity.buyAmount;
  const amounts = buying
    ? `${sold} ${PLATFORM_FEE_SYMBOL} → ${bought} ${symbol}`
    : `${sold} ${symbol} → ${bought} ${PLATFORM_FEE_SYMBOL}`;
  // Every platform fee settles in USDC. The USD figure when the service sent
  // one, otherwise the base-unit amount read as USDC; neither is ever guessed.
  const feeUsd = formatUsdString(activity.platformFeeAmountUsd);
  const feeAtomic =
    activity.platformFeeAmountAtomic === null
      ? null
      : formatUsdcAtomic(activity.platformFeeAmountAtomic);
  const fee = feeUsd
    ? t("fee", { fee: feeUsd })
    : feeAtomic
      ? t("fee", { fee: `${feeAtomic} ${PLATFORM_FEE_SYMBOL}` })
      : t("feeUnknown");
  const txUrl = explorerTxUrl(activity.chainId, activityTxHash(activity));
  const when = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(activity.confirmedAt ?? activity.createdAt));

  return (
    <li
      aria-label={t("tradeLabel", { side, symbol })}
      className="flex items-start gap-3 border-t border-white/6 px-4 py-3 sm:px-6"
    >
      <AssetIcon sym={symbol} bg={tokenBg(symbol)} logo={activity.tokenLogoUrl} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${buying ? "text-up" : "text-down"}`}
          >
            {side}
          </span>
          <span className="tnum truncate font-sans text-[13.5px] font-medium">{amounts}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-white/50">
          <span>{when}</span>
          <span>{fee}</span>
          {txUrl ? (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 underline-offset-2 hover:text-white hover:underline"
            >
              {t("viewTx")}
            </a>
          ) : null}
        </span>
        {isPendingActivity(activity.status) ? (
          <span className="mt-0.5 block text-[11.5px] text-amber-200/80">{t("pendingNote")}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="tnum font-sans text-[13.5px] font-medium">
          {formatUsdString(activity.usdAmount) ?? "—"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(activity.status)}`}
        >
          {t(STATUS_KEY[activity.status])}
        </span>
      </span>
    </li>
  );
}
