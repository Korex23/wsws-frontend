"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { PerpsSection } from "@/features/trade/components/perps-section";
import { PerpsBackLink } from "@/features/trade/components/perps-back-link";

// Perpetuals as its own immersive, full-viewport screen: no sidebar, no topbar,
// just a back link to Portfolio (the account home) and the perps desk itself.
// Sits in (session) but OUTSIDE (app), so it gets a signed-in session without
// the app shell's nav chrome — the perps desk owns its own order ticket and its
// own sheets, so it needs no modal host either.
export default function PerpsPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-[1920px] px-4 pt-5 sm:px-6 lg:px-8">
          <PerpsBackLink href="/dashboard#portfolio" label="Portfolio" />
        </div>
        <PerpsSection />
      </div>
    </AuthGuard>
  );
}
