import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CategoryPrediction } from "../category-market-presenter";
import { CategoryBetSidebar } from "./category-bet-sidebar";

vi.mock("@privy-io/react-auth", () => ({
  getAccessToken: vi.fn(),
  getIdentityToken: vi.fn(),
}));

// Signed out, through the Decane-backed session seam; "login" is now a route
// to /auth, so the router is stubbed rather than a Privy login callback.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: false,
    evmAddress: null,
    solanaAddress: null,
    profile: { name: "Account", email: "", avatarSeed: "worldstreet" },
    logout: vi.fn(),
  }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/use-withdraw", () => ({
  useSendToken: () => ({ sendToken: vi.fn() }),
}));

const prediction: CategoryPrediction = {
  eventId: "event-1",
  eventTitle: "Election",
  marketId: "market-1",
  q: "Will the candidate win?",
  tag: "Elections",
  vol: "$1M vol",
  yes: "5¢",
  no: "95¢",
  pct: 5,
  yesTokenId: "yes-token",
  noTokenId: "no-token",
  conditionId: "condition",
  tradable: true,
  yesDecimalOdds: 20,
  noDecimalOdds: 1.05,
};

function renderSidebar(props: Partial<React.ComponentProps<typeof CategoryBetSidebar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CategoryBetSidebar
        selections={[{ prediction, side: "yes" }]}
        desktopOpen
        mobileOpen={false}
        onDesktopOpenChange={vi.fn()}
        onMobileOpenChange={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("category bet sidebar", () => {
  it("shows the accumulator requirements and removes a pick on desktop", () => {
    const onRemove = vi.fn();
    renderSidebar({ onRemove });

    expect(screen.getByRole("button", { name: "Betslip (1)" })).toBeInTheDocument();
    expect(screen.getByText("Accumulator")).toBeInTheDocument();
    expect(screen.getByText("Add 2 more markets.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove will the candidate win/i }));
    expect(onRemove).toHaveBeenCalledWith("condition");
  });

  it("opens the same accumulator as a mobile bottom sheet", () => {
    const onMobileOpenChange = vi.fn();
    renderSidebar({
      desktopOpen: false,
      mobileOpen: true,
      onMobileOpenChange,
      selections: [{ prediction, side: "no" }],
    });

    expect(screen.getByText("No", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close bet slip" })[0]);
    expect(onMobileOpenChange).toHaveBeenCalledWith(false);
  });
});
