"use client";

import { useQueryClient } from "@tanstack/react-query";
import { DecaneKit } from "decane-connect-kit";
// Staging (post-Decane-fork) addition: fans Polymarket query invalidations
// across tabs. Pure query-cache plumbing, no wallet — safe under Decane.
import { usePredictionQueryBroadcast } from "@/features/prediction/markets/query-broadcast";
import { NetworkStatusProvider } from "@/components/providers/network-status";
import { SessionCacheGuard } from "@/components/providers/session-cache-guard";
import { DecaneTokenBridge } from "@/components/providers/decane-token-bridge";
import { DecaneRecoveryHost } from "@/components/providers/decane-recovery-host";
import { AnalyticsIdentity } from "@/components/providers/analytics-identity";
import { AnalyticsSegments } from "@/components/providers/analytics-segments";
import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
// Deep import, not the barrel. `@/features/casino` re-exports 27 components,
// including the chess and arkjet screens, and this provider is mounted on
// every signed-in route — so the barrel pulled the whole casino into the
// initial payload for one timer. optimizePackageImports only rewrites npm
// barrels, not ours. This file sits under app/ rather than components/ for
// the same reason the root providers do: it composes a feature, and only the
// app layer may. The gate loads the host itself on demand.
import { MiniTimerGate } from "@/features/casino/components/last-standing/mini-timer-gate";
import { BroadcastSessionProvider } from "@/components/broadcast/broadcast-session";
import {
  collectRotatedRecoveryPassword,
  deliverRecoveryFile,
  promptForRecoveryFile,
  promptPin,
  promptUnlockPassword,
} from "@/lib/decane-recovery";

// Well-formed placeholders let the app build before env vars are set. Decane
// only talks to its backend when a sign-in is attempted, so mounting the kit
// with these is inert.
const DECANE_APP_ID = process.env.NEXT_PUBLIC_DECANE_APP_ID || "wsws-placeholder";
const DECANE_API_KEY = process.env.NEXT_PUBLIC_DECANE_API_KEY || "dck_test_placeholder";

// The chains the app holds value on, in Decane's social chain-id format. Keep
// in sync with EVM_NETWORKS in lib/server/alchemy.ts.
const DECANE_CHAINS = ["evm:8453", "evm:1", "evm:42161", "evm:10", "evm:137", "solana:mainnet"];

/**
 * Everything a signed-in session needs and a signed-out page does not: the
 * Decane wallet SDK, the broadcast session that holds the LiveKit room, the
 * balance-visibility toggle, the analytics identity, the timer pop-out.
 *
 * Mounted by the layout beside it, so it wraps sign-in, onboarding, the
 * product routes and the games, and persists across every navigation among
 * them. It used to sit in the root providers, which put the wallet SDK, viem
 * and livekit-client, over a megabyte of JavaScript, in front of the landing
 * page and the privacy policy. Neither uses any of it.
 *
 * Privy is no longer mounted here (ADR-0009). The two surfaces that must still
 * sign with the OLD Privy wallets — the Update Balance sweep and
 * /prediction/reclaim — mount LegacyPrivyProvider themselves, so the legacy SDK
 * loads only for the users who still have something to move. That is also why
 * the Solana RPC wiring Privy needed is gone: the kit takes its chains from
 * config and reads through our own proxy.
 */
export function SessionProviders({ children }: { children: React.ReactNode }) {
  // Cross-tab Polymarket query invalidation (staging addition, post-fork).
  usePredictionQueryBroadcast(useQueryClient());

  // TODO(decane-migration): staging also mounted <PredictionCashoutTracker/>
  // here. It was written against Privy ("needs Privy and the query client") and
  // postdates the Decane fork, so it needs re-porting onto the Decane signer
  // before it can mount — Privy is no longer a provider on this route. Omitted
  // for now so the tree builds on Decane; re-add once adapted.

  return (
    <DecaneKit
      config={{
        appId: DECANE_APP_ID,
        mode: "social",
        theme: "dark",
        social: {
          apiKey: DECANE_API_KEY,
          authMethods: ["google", "email", "kingschat"],
          chains: DECANE_CHAINS,
          // The kit's own full-screen "Creating your wallet" overlay is off:
          // the sign-in page shows its branded busy panel for the creating
          // window (it is where the Google redirect lands), and AuthGuard's
          // loading screen covers the unlocking window on every other route.
          showStatusOverlay: false,
          // Wallet recovery rotates the share set and must hand the user a
          // fresh recovery file; these bridge into the dialogs rendered by
          // DecaneRecoveryHost below. Without onRecoveryRotated the kit
          // refuses to run recovery at all. No signup-time offer: new devices
          // are provisioned from the sign-in alone since 2.7.4.
          onRecoveryRotated: collectRotatedRecoveryPassword,
          onRecoveryFileReady: deliverRecoveryFile,
          // Without this, a device with no share and no passkey throws
          // NewDeviceError instantly instead of asking for the saved file.
          promptForRecoveryFile,
          // A device that cannot reach a passkey — an unreachable password
          // manager, no WebAuthn PRF, or a declined prompt — wraps its device
          // share with an unlock password instead. promptPin stays for the
          // devices enrolled before that, which still open with their PIN.
          promptPin,
          promptUnlockPassword,
        },
      }}
    >
      <NetworkStatusProvider>
        <BalanceVisibilityProvider>
          {/* The broadcast session sits above the router on purpose: it holds
              the LiveKit room and the Market Square stream, so a broadcast
              started on the chess board survives navigating to the portfolio
              instead of dying with the page that started it. */}
          <BroadcastSessionProvider>
            {children}
            {/* Empties the persisted query cache when the session ends, so
                a signed-out browser holds no balances. Needs both the session
                and query contexts. Renders nothing. */}
            <SessionCacheGuard />
            {/* Registers the kit's synchronous getAccessToken with the fetch
                wrapper, so authed requests carry a Decane bearer. Replaces
                Privy's IdentityTokenBridge: Decane issues no identity token,
                and routes resolve the user from verified claims instead.
                Renders nothing. */}
            <DecaneTokenBridge />
            {/* Syncs Mixpanel's identity to auth state; needs to sit inside
                DecaneKit to read it. Renders nothing. */}
            <AnalyticsIdentity />
            <AnalyticsSegments />
            {/* Renders the recovery, PIN and unlock-password dialogs the kit
                asks for through the callbacks above. Renders nothing until one
                is requested. */}
            <DecaneRecoveryHost />
            {/* Owns the Last Man Standing pop-out timer. Mounted here, above the
                pages, so the floating window survives navigating anywhere in
                the app. The gate loads the host only on Arkade routes or while
                a game is followed; the rest of the time nothing is loaded. */}
            <MiniTimerGate />
          </BroadcastSessionProvider>
        </BalanceVisibilityProvider>
      </NetworkStatusProvider>
    </DecaneKit>
  );
}
