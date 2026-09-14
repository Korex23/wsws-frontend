"use client";

import { useEffect } from "react";
import { useSocialWallet } from "decane-connect-kit";
import { registerDecaneTokenSource } from "@/lib/auth-token";
import { captureDisplayProfileFromUrl } from "@/lib/display-profile";

// Hands the Decane session's access-token getter to the transport layer, so
// apiFetch (a plain module, no React context) can attach the token. Renders
// nothing; must sit inside DecaneKit to read the session.
export function DecaneTokenBridge() {
  const { getAccessToken } = useSocialWallet();
  useEffect(() => {
    registerDecaneTokenSource(getAccessToken);
    return () => registerDecaneTokenSource(null);
  }, [getAccessToken]);
  // A child of DecaneKit, so this effect runs before the kit's init effect
  // strips the sign-in return params from the URL, which is the only moment
  // the Google profile is readable (see lib/display-profile).
  useEffect(() => {
    captureDisplayProfileFromUrl();
  }, []);
  return null;
}
