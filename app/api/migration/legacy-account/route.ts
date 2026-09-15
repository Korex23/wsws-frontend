import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { getPrivyClient } from "@/lib/server/privy";
import { fetchPortfolio } from "@/lib/server/alchemy";

// Does the address the caller signed in with belong to a Privy account that
// held an embedded wallet? One boolean, and it decides one thing: whether the
// balance card offers "Update Balance".
//
// Why this exists. offerMigration() has two signals today and neither reaches
// a migrated user on a NEW device: the browser has no `privy:` keys to find,
// and /status reports hasLegacyFunds only once a mapping exists. So the user
// signs in, sees 0.00, and nothing explains where their money went. This is
// the third signal, and it is the only one that works before the backfill has
// run.
//
// What it deliberately is NOT. It records no mapping, grants no access and
// proves nothing about who the caller is. The address arrives from the
// browser's own display profile (lib/display-profile), which Decane cannot
// confirm — it stores no profile server-side — so this answer is a hint for
// the UI and must never become authority. Linking still demands both provider
// tokens; the sweep still demands a real Privy signature. The deterministic
// backfill exists precisely because matching identities on an email is an
// account-takeover primitive, and nothing here may drift into doing that.
//
// The cost accepted: for a signed-in caller this reveals whether an address
// had an account here. Bounded by requiring a verified Decane session, and by
// the client asking once per session rather than per render.

export const dynamic = "force-dynamic";

/**
 * `legacyFundsUsd` is what the old wallet still holds, or null for "could not
 * read it". The distinction carries weight: a confident zero retires the
 * button for someone who already swept but whose browser still has `privy:`
 * keys, and null must never do that — a failed read would take the door away
 * from someone whose money is sitting right there.
 */
function answer(hasLegacyAccount: boolean, legacyFundsUsd: number | null = null) {
  return NextResponse.json(
    { hasLegacyAccount, legacyFundsUsd },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  // A verified session, so this is not an open lookup. The session's identity
  // is not compared to the address — it cannot be — it only gates the call.
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  let address: string | null = null;
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email === "string") address = body.email.trim().toLowerCase();
  } catch {
    // No body, or not JSON. Falls through to the empty-address answer below.
  }
  // Never let an empty or absurd value reach Privy as a query.
  if (!address || address.length > 320 || !address.includes("@")) return answer(false);

  try {
    const user = await getPrivyClient().users().getByEmailAddress({ address });
    // An account with no embedded wallet never held money here, so offering
    // the sweep to it would be a dead end with a scary label. The server SDK
    // speaks snake_case, unlike lib/user's client-side helper.
    const wallet = (chain: "ethereum" | "solana"): string | undefined => {
      const hit = user.linked_accounts.find(
        (account) =>
          account.type === "wallet" &&
          "chain_type" in account &&
          account.chain_type === chain &&
          "address" in account
      );
      return hit && "address" in hit && typeof hit.address === "string" ? hit.address : undefined;
    };
    const evm = wallet("ethereum");
    const solana = wallet("solana");
    if (!evm && !solana) return answer(false);

    // What that wallet still holds. Read here rather than trusted from the
    // browser, and only believed when every network answered: Portfolio.missing
    // means the total is a floor, and a floor of zero is not an empty wallet.
    let legacyFundsUsd: number | null = null;
    try {
      const portfolio = await fetchPortfolio(evm, solana);
      if (!portfolio.missing?.length) legacyFundsUsd = portfolio.totalUsd;
    } catch {
      // Unknown, which is not the same as empty. Left null on purpose.
    }
    return answer(true, legacyFundsUsd);
  } catch {
    // No such user is the ordinary case and Privy reports it as an error. A
    // genuine outage lands here too, and both answer the same way on purpose:
    // false must read as "no reason to offer it", never as "you have nothing".
    // The caller keeps its other signals, which is why this one only ever ORs.
    return answer(false);
  }
}
