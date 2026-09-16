"use client";

import { useTranslations } from "next-intl";
import type { MigrationStage } from "@/features/migrate/components/move-old-money-panel";

const STAGES: readonly MigrationStage[] = ["signIn", "move", "finish"];
const LABEL: Record<MigrationStage, string> = {
  signIn: "gateStepSignIn",
  move: "gateStepMove",
  finish: "gateStepFinish",
};

/**
 * The top of the migration gate: what this is, why it cannot be closed, and
 * how far along the user is. The rail is the one place the accent is spent —
 * everything else is the sheet's own white-on-black.
 */
export function MigrationGateHeader({ stage, done }: { stage: MigrationStage; done: boolean }) {
  const t = useTranslations("migrate");
  const at = STAGES.indexOf(stage);
  return (
    <header className="mb-5 border-b border-white/10 pb-5">
      <h2 className="ws-display text-[28px] leading-[1.1] tracking-[-0.015em] md:text-[30px]">
        {t("gateTitle")}
      </h2>
      <p className="mt-2 max-w-[44ch] text-[13.5px] leading-normal text-white/60">
        {t("gateIntro")}
      </p>
      <ol
        className="mt-5 grid grid-cols-3 gap-2"
        aria-label={t("gateProgress", { step: done ? STAGES.length : at + 1, of: STAGES.length })}
      >
        {STAGES.map((s, i) => {
          const filled = done || i < at;
          const active = !done && i === at;
          return (
            <li key={s} aria-current={active ? "step" : undefined}>
              <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
                    active ? "bg-accent shadow-[0_0_10px_rgba(212,212,216,0.55)]" : "bg-accent"
                  }`}
                  style={{ width: filled ? "100%" : active ? "50%" : "0%" }}
                />
              </div>
              <div
                className={`mt-2 text-[12.5px] leading-snug ${
                  active || filled ? "text-white" : "text-white/45"
                }`}
              >
                {t(LABEL[s])}
              </div>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
