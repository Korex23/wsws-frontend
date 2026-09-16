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
   * The signed-in identity belongs to a legacy account — see useLegacyAccount.
   * Whether that account's WALLET holds anything is deliberately not part of
   * this decision.
   */
  legacyAccount?: boolean;
}): boolean {
  // Already linked: the mapping exists, the ledgers re-key themselves, and
  // there is nothing left to ask the user for. `linked` is the whole test,
  // because linking is what the offer is FOR.
  if (input.status?.linked === true) return false;
  // Marked done on this device. That flag only fills the gap the service
  // leaves (not loaded, or could not say): when the service has answered
  // "not linked", its answer wins. The flag is per DEVICE, not per user — an
  // earlier account finishing on this browser says nothing about the one
  // signed in now — and it can be set by a sweep whose link never landed.
  // Either way the service, not localStorage, knows whether THIS account is
  // still on the old identity.
  if (input.complete && input.status?.linked !== false) return false;

  // Anything below means "still on the old identity".
  //
  // An empty wallet is NOT a reason to stay quiet. The sweep moves tokens; the
  // re-key moves the profile, the followers, the posts, the chess ledgers, the
  // kash points and tier — none of which a balance can see. A user with $0 and
  // four years of history has the most to lose by never linking, and used to
  // be the one this stayed silent for.
  if (input.status?.hasLegacyFunds || input.status?.pendingOnramps.length) return true;
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
