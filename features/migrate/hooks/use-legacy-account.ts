"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { readDisplayProfile } from "@/lib/display-profile";

// Whether the address this browser signed in with had a Privy account holding
// an embedded wallet. The third signal behind the balance card's Update
// Balance button, and the only one that reaches a migrated user on a new
// device: there are no `privy:` keys in a fresh browser, and /status knows
// nothing until a mapping exists.
//
// Asked once per page load, not per render: it costs a Privy management-API
// call on the server. Cached at module scope so a remount or a soft navigation
// reuses the answer.
//
// False is "no reason to offer it", never "you have nothing" — the route
// answers false for an outage too. Callers must OR this with their other
// signals rather than gate on it.

export interface LegacyAccount {
  /** The signed-in address had a Privy account holding an embedded wallet. */
  has: boolean;
  /** What that wallet still holds, or null for "could not read it". */
  fundsUsd: number | null;
}

const UNKNOWN: LegacyAccount = { has: false, fundsUsd: null };

let cached: LegacyAccount | null = null;
let inFlight: Promise<LegacyAccount> | null = null;

async function ask(): Promise<LegacyAccount> {
  // Whatever this browser knows about who signed in. Self-reported and
  // unverifiable — see lib/display-profile — so it is good enough to decide
  // whether to show a button and never enough to key anything on.
  //
  // Both, because not every legacy user has an address: Privy allowed signing
  // in with Twitter, and those accounts carry a handle and nothing else.
  // Asking only for an email would strand every one of them.
  const profile = readDisplayProfile();
  const email = profile?.email;
  const xId = profile?.providerSubject;
  if (!email && !xId) return UNKNOWN;
  try {
    const res = await apiFetch(
      "/api/migration/legacy-account",
      {
        method: "POST",
        body: JSON.stringify({
          ...(email ? { email } : {}),
          ...(xId ? { xId } : {}),
        }),
      },
      { requireAuth: true }
    );
    if (!res.ok) return UNKNOWN;
    const body = (await res.json()) as { hasLegacyAccount?: unknown; legacyFundsUsd?: unknown };
    return {
      has: body.hasLegacyAccount === true,
      fundsUsd: typeof body.legacyFundsUsd === "number" ? body.legacyFundsUsd : null,
    };
  } catch {
    return UNKNOWN;
  }
}

export function useLegacyAccount(): LegacyAccount {
  const [state, setState] = useState<LegacyAccount>(cached ?? UNKNOWN);

  useEffect(() => {
    if (cached !== null) return;
    let live = true;
    void (async () => {
      inFlight ??= ask();
      const answer = await inFlight;
      // An answer that found nothing may be an outage rather than a verdict,
      // so it is not cached and the next mount asks again. A found account is
      // settled; its balance is re-read on the next page load, which is often
      // enough for a figure that only changes when the user sweeps.
      if (answer.has) cached = answer;
      else inFlight = null;
      if (live && answer.has) setState(answer);
    })();
    return () => {
      live = false;
    };
  }, []);

  return state;
}
