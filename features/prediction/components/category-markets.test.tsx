import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryMarketEvent, DiscoveryMarketSummary } from "../markets/api";
import { CategoryMarketsShell } from "./politics-markets-shell";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), detail: vi.fn() }));
vi.mock("../markets/hooks/use-discovery-markets", () => ({
  useDiscoveryEvents: mocks.catalog,
  useDiscoveryEvent: mocks.detail,
}));
vi.mock("../hooks/use-polymarket-access", () => ({
  usePolymarketAccess: () => ({ allowed: true }),
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

export function market(id: string, title: string): DiscoveryMarketSummary {
  return {
    id,
    conditionId: `condition-${id}`,
    slug: title,
    question: `Will ${title} win?`,
    groupItemTitle: title,
    description: null,
    category: "politics",
    imageUrl: null,
    iconUrl: null,
    startDate: null,
    endDate: null,
    active: true,
    closed: false,
    acceptingOrders: true,
    restricted: false,
    enableOrderBook: true,
    liquidity: 100,
    volume: 200,
    volume24h: 20,
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    spread: null,
    oneDayPriceChange: null,
    negRisk: false,
    rfqEnabled: false,
    outcomes: [
      { name: "Yes", tokenId: `yes-${id}`, referencePrice: 0.05, decimalOdds: 20 },
      { name: "No", tokenId: `no-${id}`, referencePrice: 0.95, decimalOdds: 1.05 },
    ],
  };
}

export const election: DiscoveryMarketEvent = {
  id: "101",
  slug: "presidential-election",
  title: "Presidential election",
  description: "Election rules",
  imageUrl: null,
  iconUrl: null,
  startDate: null,
  endDate: null,
  active: true,
  closed: false,
  restricted: false,
  liquidity: 500,
  volume: 1000,
  volume24h: 100,
  oneDayPriceChange: null,
  marketCount: 41,
  markets: [market("1", "Alice"), market("2", "Bob"), market("3", "Carol")],
  tags: [{ id: "1", label: "Elections", slug: "elections" }],
};

describe("category event listing", () => {
  beforeEach(() => {
    mocks.catalog.mockReturnValue({
      events: [election],
      loading: false,
      error: false,
      hasMore: false,
    });
    mocks.detail.mockReturnValue({ event: null, loading: false, error: false });
  });

  it("shows one compact event row whose market information opens its detail route", () => {
    render(<CategoryMarketsShell category="politics" />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /1\s*all politics/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open presidential election details/i })
    ).toHaveAttribute("href", "/prediction/markets/101?category=politics&source=markets");
    expect(screen.getByRole("button", { name: "Yes 20.00" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "No 1.05" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: /view all/i })).not.toBeInTheDocument();
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("keeps single markets directly selectable and uses decimal odds", () => {
    mocks.catalog.mockReturnValue({
      events: [{ ...election, marketCount: 1, markets: [market("1", "Alice")] }],
      loading: false,
      error: false,
    });
    render(<CategoryMarketsShell category="politics" />);
    expect(
      within(screen.getByRole("article")).getByRole("button", { name: "Yes 20.00" })
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: /open will alice win/i })).toHaveAttribute(
      "href",
      "/prediction/markets/101?category=politics&source=markets"
    );
  });

  it("filters event titles rather than rendering every matching child market", () => {
    render(<CategoryMarketsShell category="politics" />);
    fireEvent.change(screen.getByRole("textbox", { name: /filter politics markets/i }), {
      target: { value: "Presidential election" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByRole("textbox", { name: /filter politics markets/i }), {
      target: { value: "No such event" },
    });
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText(/no matching politics/i)).toBeInTheDocument();
  });
});
