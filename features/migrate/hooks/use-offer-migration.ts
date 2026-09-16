"use client";

import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { useLegacyAccount } from "@/features/migrate/hooks/use-legacy-account";
import {
  maskBalance,
  offerMigration,
  useFundsMoved,
  useLocalPrivyHistory,
  useMigrationCompleteFlag,
} from "@/features/migrate/lib/visibility";

// Whether to offer the move to Market 2.0, and mask the balance while it is
// pending. The test is "is this account still on the old identity", not "is
// there money in the old wallet": the re-key carries the profile, followers,
// posts, chess ledgers, kash points and tier, none of which a balance can see.
// A user with $0 and four years of history has the most to lose by never
// linking.
export function useOfferMigration(): boolean {
  const complete = useMigrationCompleteFlag();
  const localHistory = useLocalPrivyHistory();
  const status = useMigrationStatus();
  // Does this identity belong to a legacy account at all. The wallet balance it
  // also returns is deliberately unused here — see the note above.
  const legacy = useLegacyAccount();
  const offer = offerMigration({
    complete,
    localHistory,
    status: status.data,
    legacyAccount: legacy.has,
  });
  console.log(
    `[migrate] offer migrate-to-2.0: ${offer ? "YES" : "no"}` +
      ` [already linked: ${status.data === undefined ? "loading" : (status.data.linked ?? "service could not say")}, done on this device: ${complete},` +
      ` privy keys here: ${localHistory}, service reports funds: ${status.data?.hasLegacyFunds ?? "unknown"},` +
      ` directory: ${legacy.has ? "legacy account found" : "no legacy account"}]`
  );
  return offer;
}

// Whether the balance card should hide the figure. Comes off as soon as a run
// moves anything, so a partial migration shows the money that has arrived
// while the button stays for whatever is left.
export function useMaskBalance(): boolean {
  return maskBalance({ offer: useOfferMigration(), moved: useFundsMoved() });
}
