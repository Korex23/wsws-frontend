// What the review screen shows, derived from discovered holdings: what moves
// on its own, what the user has to opt in to, what waits, what cannot move.
// Pure so the partition is tested.

import { isSettleable, sumValueUsd } from "@/lib/migration/schedule";
import type { LegacyHolding, Settleability, Venue } from "@/lib/migration/types";

export interface ReviewGroups {
  automatic: LegacyHolding[];
  optIn: LegacyHolding[];
  later: LegacyHolding[];
  skipped: LegacyHolding[];
  // Value of everything the run would move with the current opt-ins.
  movingUsd: number;
}

export function reviewGroups(
  holdings: readonly LegacyHolding[],
  optIn: ReadonlySet<string>,
  now: number
): ReviewGroups {
  const groups: ReviewGroups = { automatic: [], optIn: [], later: [], skipped: [], movingUsd: 0 };
  for (const h of holdings) {
    if (h.settleability.state === "stranded") groups.skipped.push(h);
    else if (!isSettleable(h, now)) groups.later.push(h);
    else if (h.deterministic) groups.automatic.push(h);
    else groups.optIn.push(h);
  }
  groups.movingUsd =
    sumValueUsd(groups.automatic) + sumValueUsd(groups.optIn.filter((h) => optIn.has(h.id)));
  return groups;
}

// Opt-ins checked before the user touches anything. Cancelling a resting
// perp order loses nothing, so it starts checked; closing a position or
// selling shares realises a price, so those start unchecked.
export function defaultOptIn(holdings: readonly LegacyHolding[]): Set<string> {
  return new Set(
    holdings
      .filter((h) => !h.deterministic && h.venue === "perps" && h.kind === "order")
      .map((h) => h.id)
  );
}

// The translation key under migrate.reason for a holding that is not moving
// now; null for one that is.
export function reasonKey(s: Settleability): string | null {
  switch (s.state) {
    case "now":
      return null;
    case "waitUntil":
    case "needsBackend":
    case "stranded":
      return s.reason;
    case "pending":
      return "onramp";
  }
}

// Holdings in display order: by venue in the order given, then as discovered.
export function byVenue(
  holdings: readonly LegacyHolding[],
  order: readonly Venue[]
): Array<{ venue: Venue; holdings: LegacyHolding[] }> {
  const groups = new Map<Venue, LegacyHolding[]>();
  for (const h of holdings) {
    const group = groups.get(h.venue);
    if (group) group.push(h);
    else groups.set(h.venue, [h]);
  }
  const rank = (venue: Venue) => {
    const index = order.indexOf(venue);
    return index === -1 ? order.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([venue, list]) => ({ venue, holdings: list }));
}

export const VENUE_ORDER: readonly Venue[] = [
  "wallet",
  "perps",
  "polymarket",
  "cpmm",
  "cashier",
  "vault",
  "kash",
  "earn",
  "onramp",
];
