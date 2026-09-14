"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { toast } from "@/lib/toast";
import { friendlyError, supportDetail } from "@/lib/errors";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount, toBaseUnits } from "@/lib/trade/math";
import { getWalletAddress } from "@/lib/user";
import {
  getAccountState,
  getCctpDepositConfig,
  recordCctpDeposit,
} from "@/features/trade/lib/hyperliquid-api";
import { CCTP_V2, HYPERCORE_DEX, USDC } from "@/lib/cctp/config";
import { encodeApprove, encodeBaseToHyperCoreBurn } from "@/lib/cctp/cctp";

const BASE_CHAIN_ID = 8453;
const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PERCENTS = [25, 50, 75, 100];
// Hyperliquid's perps floor is $5; a little headroom so a deposit reliably
// clears it after any transit fee.
const MIN_TOPUP_USDC = 6;
// CCTP lands USDC directly on HyperCore in ONE hop (Base -> HyperCore), so
// there's no separate Arbitrum bridge step. The credit typically shows in well
// under a minute, but attestation + mint + forward can occasionally run longer.
// This only bounds the wait, it never fails the flow.
const CREDIT_POLL_TIMEOUT_MS = 180_000;
const CREDIT_POLL_INTERVAL_MS = 3_000;
// When the backend has the USER cover the mint (ARK_CCTP_USER_PAYS_DEPOSIT_FEE
// = true), Circle's Forwarding Service does the mint and takes ~this much out of
// the deposit. When it's false the platform self-relays and the deposit is free.
const CIRCLE_FEE_USDC = 0.24;

type Stage =
  | { name: "form" }
  | { name: "sending" }
  | { name: "confirming" }
  | { name: "done"; amount: string; credited: boolean };

interface HyperliquidFundModalProps {
  open: boolean;
  onClose: () => void;
  walletId: string | null;
  /** Legacy Dextopus/Arbitrum bridge step — unused by the CCTP rail, kept
   *  optional so existing callers still typecheck without change. */
  onBridge?: () => Promise<void>;
  onFunded: () => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One click to fund the perps wallet, all the way to tradeable margin, over the
// CCTP (Circle) rail: a single sponsored Base transaction (approve + burn, no
// popup — useEvmSendBatch, the same mechanism every money-moving action here
// uses) that burns USDC to HyperEVM with the HyperCore forward hook, so the
// mint lands directly in the wallet's own HyperCore balance. Who pays the
// HyperEVM mint gas is a backend toggle (ARK_CCTP_USER_PAYS_DEPOSIT_FEE): the
// platform self-relays it (free) or Circle's Forwarding Service does it (a
// small fee out of the deposit). The backend records the burn and, in
// platform-pays mode, self-relays the mint; this modal polls the perps balance
// for the credit.
export function HyperliquidFundModal({
  open,
  onClose,
  walletId,
  onFunded,
}: HyperliquidFundModalProps) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const { user } = usePrivy();
  const walletAddress = getWalletAddress(user, "ethereum");
  const portfolio = usePortfolio();
  const sendEvmBatch = useEvmSendBatch();

  // Whether the user covers the mint fee (ARK_CCTP_USER_PAYS_DEPOSIT_FEE on the
  // backend) — fetched on open so the form can show the fee before they submit.
  // When false, the platform self-relays the mint and the deposit is free.
  const [userPaysFee, setUserPaysFee] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCctpDepositConfig()
      .then((c) => {
        if (!cancelled) setUserPaysFee(c.userPaysDepositFee);
      })
      .catch(() => {
        if (!cancelled) setUserPaysFee(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const baseUsdc = portfolio.tokens.find(
    (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC"
  );
  const balance = baseUsdc?.balance ?? 0;

  const amountNum = Number(amount);
  const validAmount = amount !== "" && Number.isFinite(amountNum) && amountNum > 0;
  const busy = stage.name !== "form" && stage.name !== "done";
  // Once a top-up is running, the live main-wallet balance keeps falling as the
  // money leaves — comparing the (now-frozen) typed amount against it would
  // spuriously flag "exceeds your balance" for a transfer already underway. The
  // amount was validated against the balance the moment the user confirmed.
  const withinBalance = validAmount && (busy || amountNum <= balance);
  const aboveMinimum = validAmount && (busy || amountNum >= MIN_TOPUP_USDC);
  const canSubmit =
    Boolean(walletId) && Boolean(walletAddress) && withinBalance && aboveMinimum && !busy;

  const close = () => {
    setStage({ name: "form" });
    setAmount("");
    onClose();
  };

  const handleAmount = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
  };

  const setPercent = (pct: number) => {
    if (balance <= 0) return;
    // Floors to cents so 100% never rounds above the actual balance.
    setAmount((Math.floor(((balance * pct) / 100) * 100) / 100).toFixed(2));
  };

  // Polls the perps balance until it rises above the pre-deposit baseline.
  // Returns false on timeout or an unknown baseline — never fails the flow,
  // only decides which "done" copy is honest.
  const waitForPerpsCredit = async (withdrawableBefore: number | null): Promise<boolean> => {
    if (!walletAddress || withdrawableBefore === null) return false;
    const deadline = Date.now() + CREDIT_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await getAccountState(walletAddress).catch(() => null);
      if (state && Number(state.withdrawable) > withdrawableBefore) return true;
      await delay(CREDIT_POLL_INTERVAL_MS);
    }
    return false;
  };

  const submit = async () => {
    if (!canSubmit || !walletId || !walletAddress) return;
    setStage({ name: "sending" });
    try {
      const config = await getCctpDepositConfig().catch(() => ({
        userPaysDepositFee: true,
        sourceDomain: 6,
      }));
      const amountUnits = toBaseUnits(amount, 6);
      // maxFee: the CCTP fast-transfer fee is a few basis points; ~0.2% (min
      // $0.02) covers it for test amounts. Platform-pays keeps maxFee there —
      // below Circle's Forwarding Service fee, so our own keeper does the mint
      // for free; user-pays adds a buffer for Circle's forward fee (~$0.24).
      // NOTE: size these from Circle's live /v2/burn/USDC/fees quote for prod.
      const baseMaxFee = amountUnits / 500n > 20_000n ? amountUnits / 500n : 20_000n;
      const maxFee = config.userPaysDepositFee ? baseMaxFee + 250_000n : baseMaxFee;

      // Baseline the credit poll must rise above.
      const perpsBefore = await getAccountState(walletAddress)
        .then((s) => Number(s.withdrawable))
        .catch(() => null);

      // One sponsored Base transaction: approve the TokenMessenger, then burn to
      // HyperEVM with the HyperCore forward hook. No popup, gas sponsored.
      const txHash = await sendEvmBatch(
        [
          { to: USDC.base, data: encodeApprove(amountUnits) },
          {
            to: CCTP_V2.tokenMessenger,
            data: encodeBaseToHyperCoreBurn(
              amountUnits,
              walletAddress as Address,
              maxFee,
              HYPERCORE_DEX.perps
            ),
          },
        ],
        BASE_CHAIN_ID
      );

      setStage({ name: "confirming" });
      // Record the burn so the backend tracks it and, in platform-pays mode,
      // self-relays the mint. A record failure never blocks the deposit — the
      // burn already happened and the credit poll below is the real signal.
      await recordCctpDeposit(walletId, txHash, amount).catch(() => {});

      const credited = await waitForPerpsCredit(perpsBefore);
      setStage({ name: "done", amount, credited });
      onFunded();
    } catch (error) {
      const detail = supportDetail(error, 120);
      const friendly = friendlyError(error, "Deposit failed.");
      toast.error(detail && detail !== friendly ? `${friendly} (${detail})` : friendly);
      setStage({ name: "form" });
    }
  };

  const stageMessage: Record<Stage["name"], string> = {
    form: "",
    sending: "Depositing…",
    confirming: "Confirming…",
    done: "",
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {stage.name === "done" ? (
          <SuccessPanel title="Perps wallet funded" onDone={close}>
            {formatAmount(Number(stage.amount))} USDC
            {stage.credited
              ? " is in your perps wallet — ready to trade."
              : " is on its way into your perps wallet — it should land within a minute or two."}
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="ws-display text-[18px]">Top up</div>
              <p className="mt-1 text-[12.5px] font-normal text-white/50">
                Usually takes under a minute.
              </p>
            </div>

            {/* The amount is the whole point of this screen — everything else
                (label, balance, presets) stays small and out of its way. */}
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="ws-display tnum text-[28px] text-white/35">$</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmount(e.target.value)}
                  placeholder="0"
                  disabled={busy}
                  autoFocus
                  size={Math.max(1, amount.length || 1)}
                  className="ws-display tnum max-w-full bg-transparent text-center text-[64px] leading-none text-white outline-none placeholder:text-white/15 disabled:opacity-60"
                />
              </div>
              <div className="tnum text-[12.5px] font-normal text-white/45">
                {formatAmount(balance)} USDC available
              </div>
              {/* Free (self-relay) shows nothing. Only the user-pays (Circle)
                  path surfaces a fee, so they know the net that will land. */}
              {userPaysFee === true && validAmount && withinBalance ? (
                <p className="tnum text-[12px] font-normal text-white/45">
                  ~${formatAmount(CIRCLE_FEE_USDC)} fee · about $
                  {formatAmount(Math.max(0, amountNum - CIRCLE_FEE_USDC))} lands.
                </p>
              ) : null}
              {validAmount && !withinBalance ? (
                <p className="text-down text-[12px] font-normal">
                  Exceeds your available {formatAmount(balance)} USDC.
                </p>
              ) : validAmount && !aboveMinimum ? (
                <p className="text-down text-[12px] font-normal">
                  Minimum top-up is ${formatAmount(MIN_TOPUP_USDC)}.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-2">
              {PERCENTS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercent(pct)}
                  disabled={balance <= 0 || busy}
                  className="tnum cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </button>
              ))}
            </div>

            {!walletId || !walletAddress ? (
              <p className="text-center text-[12.5px] leading-normal font-normal text-white/50">
                Your perps wallet isn&apos;t ready yet — try again in a moment.
              </p>
            ) : null}

            <button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="text-ink mx-auto flex w-auto cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 py-3 font-sans text-[14.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <ButtonSpinner />
                  {stageMessage[stage.name]}
                </>
              ) : (
                "Top up"
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
