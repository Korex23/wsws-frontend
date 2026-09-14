"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";
import type { VenueAdapter } from "@/lib/migration/types";
import {
  MoveOldMoneyPanel,
  type MigrationEntry,
} from "@/features/migrate/components/move-old-money-panel";

// The chrome around the migration panel: a full-height sheet above every
// other modal (the Account modal opens it from underneath), in a portal so
// it escapes whatever scroll container mounted it.
export function MoveOldMoneyFrame({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[440]">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[7px]"
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <div className="bg-sheet pointer-events-auto relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-white/14 px-[26px] pt-5 pb-[26px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:w-[min(520px,100%)] md:rounded-[24px] md:pt-[26px]">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-[18px] right-[18px] z-[1] grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
          >
            <CloseIcon />
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// The sheet with its own Privy mount, for entry points that are not already
// inside LegacyPrivyProvider (the Account modal).
export function MoveOldMoneySheet({
  open,
  onClose,
  adapters,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  adapters: readonly VenueAdapter[];
  entry: MigrationEntry;
}) {
  if (!open) return null;
  return (
    <MoveOldMoneyFrame onClose={onClose}>
      <LegacyPrivyProvider>
        <MoveOldMoneyPanel adapters={adapters} entry={entry} onClose={onClose} />
      </LegacyPrivyProvider>
    </MoveOldMoneyFrame>
  );
}
