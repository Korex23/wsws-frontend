"use client";

import { useSyncExternalStore } from "react";
import type { MigrationStatus } from "@/features/migrate/lib/api";

// Whether to offer the one-click Update Balance migration on the balance
// card. Three facts decide it:
//
// 1. This browser holds Privy session state (the `privy:` auth keys), which
//    only a past Privy sign-in leaves behind. A Decane-native signup never
//    sees the button.
// 2. The migration service, once linked, says the old wallet still holds
//    money or has a bank deposit on its way. This is what makes a brand-new
//    device offer the button too.
// 3. The migration has not already completed here. The button marks
//    completion when every asset landed, or when the old account turned out
//    to hold nothing to move.
//
// The Account modal's entry ignores all of this and is always available.

// Keys Privy only writes around a real session, not on a bare provider mount
// (which would false-positive as soon as the button itself mounts Privy).
const PRIVY_SESSION_KEYS = [
  "privy:token",
  "privy:refresh_token",
  "privy:id_token",
  "privy:connections",
];

const MIGRATION_COMPLETE_KEY = "ws.migrationComplete";

// Set the first time a run actually moves something. The migration can stay
// unfinished for days (challenge windows, keeper fills, a venue that was
// down), and masking a balance that already holds the user's money is worse
// than showing a figure that is not final yet.
const FUNDS_MOVED_KEY = "ws.migrationMoved";

// The storage event only fires in OTHER tabs, so same-tab completion notifies
// subscribers directly.
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function markMigrationComplete(): void {
  try {
    window.localStorage.setItem(MIGRATION_COMPLETE_KEY, "1");
  } catch {
    // Storage unavailable: the banner keeps showing, the sweep still worked.
  }
  notify();
}

// Re-opens the one-click door, for when a later bank deposit or a settled
// window puts money back in the old wallet.
export function clearMigrationComplete(): void {
  try {
    window.localStorage.removeItem(MIGRATION_COMPLETE_KEY);
  } catch {
    // Storage unavailable: nothing was stored to clear.
  }
  notify();
}

export function markFundsMoved(): void {
  try {
    window.localStorage.setItem(FUNDS_MOVED_KEY, "1");
  } catch {
    // Storage unavailable: the balance stays masked, the money still moved.
  }
  notify();
}

export function hasMovedFunds(): boolean {
  try {
    return window.localStorage.getItem(FUNDS_MOVED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMigrationComplete(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_COMPLETE_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasLocalPrivyHistory(): boolean {
  try {
    return PRIVY_SESSION_KEYS.some((key) => window.localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

// The device-only decision, with no server knowledge.
export function shouldOfferMigration(): boolean {
  return !isMigrationComplete() && hasLocalPrivyHistory();
}

// The full decision. Pure, so every arm is tested.
export function offerMigration(input: {
  complete: boolean;
  localHistory: boolean;
  status: MigrationStatus | undefined;
  /**
   * The address this browser signed in with belongs to a Privy account that
   * held an embedded wallet (see useLegacyAccount). The only signal that
   * reaches a migrated user on a NEW device — no `privy:` keys to find, and no
   * mapping yet for /status to answer from. It can only turn the offer ON:
   * false means "no reason to", including when the lookup simply failed.
   */
  legacyAccount?: boolean;
  /**
   * What that old wallet still holds, or null for "could not read it". A
   * CONFIDENT zero retires the offer: `privy:` keys outlive a successful
   * sweep, so a migrated user would otherwise keep being told to migrate.
   * Null never retires anything — a failed read must not take the door away
   * from someone whose money is sitting there.
   */
  legacyFundsUsd?: number | null;
}): boolean {
  if (input.complete) return false;
  // Server truth first: it knows about venues, not just the wallet.
  if (input.status?.hasLegacyFunds || input.status?.pendingOnramps.length) return true;
  // Then the probe, which can settle it either way.
  if (typeof input.legacyFundsUsd === "number") return input.legacyFundsUsd > 0;
  if (input.localHistory) return true;
  if (input.legacyAccount) return true;
  return false;
}

// Whether to hide the balance figure. Only while the old account still holds
// everything: once any of it has landed, the number is real money the user
// can see, even though more may still be on its way.
export function maskBalance(input: { offer: boolean; moved: boolean }): boolean {
  return input.offer && !input.moved;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// SSR sees neither flag; the store corrects it on hydration.
export function useMigrationCompleteFlag(): boolean {
  return useSyncExternalStore(subscribe, isMigrationComplete, () => false);
}

export function useLocalPrivyHistory(): boolean {
  return useSyncExternalStore(subscribe, hasLocalPrivyHistory, () => false);
}

export function useFundsMoved(): boolean {
  return useSyncExternalStore(subscribe, hasMovedFunds, () => false);
}
