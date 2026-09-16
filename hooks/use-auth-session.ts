"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSocialAuth } from "decane-connect-kit";
import {
  clearDisplayProfile,
  rememberDisplayProfile,
  useDisplayProfile,
} from "@/lib/display-profile";
import type { Profile } from "@/lib/user";

// The app's one auth seam. Everything that used to read Privy's usePrivy()
// for { ready, authenticated, user } reads this instead, backed by the Decane
// session. Wallet addresses come straight off the session; there is no user
// object to resolve.

export interface AuthSession {
  ready: boolean;
  authenticated: boolean;
  evmAddress: string | null;
  solanaAddress: string | null;
  profile: Profile;
  logout: () => Promise<void>;
}

// The kit persists a signed-in identity under this localStorage prefix (the
// full key ends in a slice of the API key). It hydrates that identity
// asynchronously, after SDK init, and exposes no "ready" flag, so this is the
// only way to tell "still hydrating a known user" from "signed out". Coupled
// to the kit's storage layout on purpose; revisit on kit upgrades.
const DECANE_IDENTITY_KEY_PREFIX = "decane:social:";

function hasPersistedIdentity(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DECANE_IDENTITY_KEY_PREFIX) && localStorage.getItem(key)) return true;
    }
  } catch {
    // Storage blocked: treat as no identity, the sign-in page still works.
  }
  return false;
}

// If SDK init hangs (network, bad key), stop holding the loading screen and
// let the guard route to sign-in; a stuck spinner helps nobody.
const HYDRATION_GRACE_MS = 8_000;

const emptySubscribe = () => () => {};

export function useAuthSession(): AuthSession {
  const social = useSocialAuth();
  // Server renders have no localStorage, so both sides render "not ready"
  // first and the client flips after hydration; useSyncExternalStore is the
  // mismatch-safe way to express that.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), HYDRATION_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Whatever a sign-in revealed about the user, kept device-side. Covers every
  // method uniformly: Google's params still arrive via captureDisplayProfileFromUrl
  // (which runs before the kit strips them), and a passkey login hands back the
  // profile the kit recorded on this device — so signing back in with a passkey
  // restores the same name and email rather than reverting to a generic label.
  const kitProfile = social.profile;
  useEffect(() => {
    if (kitProfile) rememberDisplayProfile(kitProfile);
  }, [kitProfile]);

  const evmAddress = social.addresses?.evm ?? null;
  const solanaAddress = social.addresses?.solana ?? null;
  // Addresses alone are not a session: after a tab closes, Decane remembers
  // WHO the user is but holds no JWT (needsReconnect), so every authed API
  // call would starve. Treating that state as signed-out routes the user
  // through /auth, where one passkey prompt or Google round trip restores a
  // real session.
  const authenticated = social.addresses !== null && Boolean(evmAddress) && !social.needsReconnect;

  // What sign-in told us about the user, persisted device-side because Decane
  // keeps no profile to re-fetch (see lib/display-profile). Google gives a
  // name; an email sign-in gives only the address, whose local part still
  // beats a generic label.
  const display = useDisplayProfile();
  const name =
    display?.name ?? (display?.email ? display.email.split("@")[0] : "World Street user");

  return {
    ready: mounted && (authenticated || graceOver || !hasPersistedIdentity()),
    authenticated,
    evmAddress,
    solanaAddress,
    profile: {
      name,
      email: display?.email ?? "",
      avatarSeed: evmAddress ?? "worldstreet",
    },
    logout: async () => {
      // Before disconnect, so an interrupted sign-out still forgets the name.
      clearDisplayProfile();
      await social.disconnect();
    },
  };
}
