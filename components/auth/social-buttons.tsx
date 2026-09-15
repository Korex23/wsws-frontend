"use client";

import { useState } from "react";
import { useSocialAuth } from "decane-connect-kit";
import { useTranslations } from "next-intl";
import { recordAuthMethod } from "@/lib/analytics/auth-method";
import { rememberPending } from "@/lib/last-auth-method";
import { toast } from "@/lib/toast";

function GoogleLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24">
      <path
        fill="#fff"
        d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7C21.8 18.7 23 15.8 23 12.3Z"
        opacity=".9"
      />
      <path
        fill="#fff"
        d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.8c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v2.9C3.7 21.4 7.5 24 12 24Z"
        opacity=".7"
      />
      <path
        fill="#fff"
        d="M5.6 14.8c-.2-.7-.4-1.4-.4-2.2s.2-1.5.4-2.2V7.5H1.8C1 9 .6 10.7.6 12.6s.4 3.6 1.2 5.1l3.8-2.9Z"
        opacity=".55"
      />
      <path
        fill="#fff"
        d="M12 5.7c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 2.2 15.1 1.2 12 1.2 7.5 1.2 3.7 3.8 1.8 7.5l3.8 2.9C6.5 7.7 9 5.7 12 5.7Z"
        opacity=".9"
      />
    </svg>
  );
}

const BUTTON =
  "flex w-full cursor-pointer items-center justify-center gap-[11px] rounded-full border border-white/14 bg-white/6 px-4 py-4 font-sans md:rounded-[14px] md:p-3.5 text-[15px] font-medium text-white transition-colors hover:border-white/28 hover:bg-white/12 disabled:cursor-wait disabled:opacity-60";

export function SocialButtons() {
  const t = useTranslations("auth");
  const {
    signInWithGoogle,
    googleLoading,
    signInWithKingsChat,
    kingschatLoading,
    canUsePasskey,
    signInWithPasskey,
  } = useSocialAuth();
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const signIn = async () => {
    try {
      recordAuthMethod("google");
      rememberPending("google");
      await signInWithGoogle();
    } catch (err) {
      console.error("Google login failed:", err);
      toast.error(t("oauthError"));
    }
  };

  // One biometric prompt instead of a Google round trip, offered when this
  // device already holds a passkey-wrapped share for the remembered user, the
  // common case after a closed tab dropped the session.
  const passkeySignIn = async () => {
    setPasskeyBusy(true);
    try {
      recordAuthMethod("passkey");
      rememberPending("passkey");
      await signInWithPasskey();
    } catch (err) {
      console.error("Passkey sign-in failed:", err);
      toast.error(t("passkeyError"));
    } finally {
      setPasskeyBusy(false);
    }
  };

  // KingsChat opens a consent popup that resolves in place (unlike Google's
  // full-page redirect), so the click handler awaits it and surfaces failures
  // as a toast. The kit invokes the popup synchronously, so no work precedes it.
  const kingschatSignIn = async () => {
    try {
      recordAuthMethod("kingschat");
      rememberPending("kingschat");
      await signInWithKingsChat();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      // A user closing the KingsChat popup is a cancellation, not an error.
      if (name !== "UserCancelledError") {
        console.error("KingsChat login failed:", err);
        toast.error(t("oauthError"));
      }
    }
  };

  return (
    <div className="flex flex-col gap-[11px]">
      {canUsePasskey ? (
        <button className={BUTTON} disabled={passkeyBusy} onClick={passkeySignIn}>
          {passkeyBusy ? t("passkeyWaiting") : t("passkeySignIn")}
        </button>
      ) : null}
      <button className={BUTTON} disabled={googleLoading} onClick={signIn}>
        <GoogleLogo />
        {t("continueGoogle")}
      </button>
      {/* KingsChat is built but not open to users yet. Shown rather than
          hidden, so the method people are waiting for is visibly on the way,
          and disabled so nobody starts a flow that cannot finish. The handler
          stays wired — a disabled button never fires it — so turning this back
          on is deleting `disabled` and the badge, nothing more. */}
      <button className={BUTTON} disabled aria-disabled="true" onClick={kingschatSignIn}>
        {kingschatLoading ? t("kingschatWaiting") : t("continueKingschat")}
        <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11.5px] font-semibold text-white/70">
          {t("kingschatSoon")}
        </span>
      </button>
    </div>
  );
}
