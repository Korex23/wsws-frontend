"use client";

import { useState, useSyncExternalStore } from "react";
import type { VenueAdapter } from "@/lib/migration/types";
import { returningFromPrivyOAuth } from "@/features/migrate/lib/oauth-return";
import { MoveOldMoneySheet } from "@/features/migrate/components/move-old-money-sheet";

// Never changes for the life of the page: the answer was read at import, before
// Privy could strip the parameters it describes.
const subscribe = () => () => {};

// Google and Twitter sign-in for the old account returns the whole page, which
// throws away the sheet the user started in. Reopening it on the way back is
// what makes that sign-in mean anything: the point of it is to move the money,
// so the user lands back in the flow — Privy exchanges the code, the panel
// discovers the old holdings, and the plain balances sweep on their own, as if
// the redirect had never happened. Mounting the provider again is also the only
// thing that clears Privy's credentials out of the URL.
//
// Renders nothing on any ordinary page load.
export function MigrationOAuthReturn({ adapters }: { adapters: readonly VenueAdapter[] }) {
  // The sheet portals to document.body, so the server must render none of it.
  // Read through useSyncExternalStore rather than as initial state, so the
  // server sees false, the client sees the truth, and hydration agrees.
  const returning = useSyncExternalStore(
    subscribe,
    () => returningFromPrivyOAuth,
    () => false
  );
  const [dismissed, setDismissed] = useState(false);

  if (!returning || dismissed) return null;
  return (
    <MoveOldMoneySheet
      open
      onClose={() => setDismissed(true)}
      adapters={adapters}
      entry="account_modal"
    />
  );
}
