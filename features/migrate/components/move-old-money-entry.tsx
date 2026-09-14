"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WalletIcon } from "@/components/ui/icons";
import type { VenueAdapter } from "@/lib/migration/types";
import { formatUsd } from "@/lib/currency";
import { MoveOldMoneySheet } from "@/features/migrate/components/move-old-money-sheet";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";

// The always-available door into the migration, for the Account modal. It
// never retires: challenge windows, keeper fills and late bank deposits can
// leave money in the old wallet long after the balance-card button is gone.
export function MoveOldMoneyEntry({
  adapters,
  className,
}: {
  adapters: readonly VenueAdapter[];
  className: string;
}) {
  const t = useTranslations("migrate");
  const [open, setOpen] = useState(false);
  const status = useMigrationStatus();
  const left = status.data?.hasLegacyFunds ? status.data.legacyFundsUsd : 0;
  return (
    <>
      <button onClick={() => setOpen(true)} className={`${className} text-white`}>
        <WalletIcon size={20} />
        <span className="min-w-0 flex-1 truncate">{t("entry")}</span>
        {left > 0 ? (
          <span className="tnum bg-accent/20 text-accent shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
            {t("entryBadge", { amount: formatUsd(left) })}
          </span>
        ) : null}
      </button>
      <MoveOldMoneySheet
        open={open}
        onClose={() => setOpen(false)}
        adapters={adapters}
        entry="account_modal"
      />
    </>
  );
}
