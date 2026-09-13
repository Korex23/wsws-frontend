import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roundState = vi.hoisted(() => ({
  current: {
    match: undefined,
    you: null,
    isLoading: true,
    error: null,
  },
}));

vi.mock("@/features/casino/hooks/use-casino-chess", () => ({
  useChessMatch: () => roundState.current,
}));

vi.mock("@/features/casino/lib/api/chess-ratings", () => ({
  fetchChessPlayerRatings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { LichessRound } from "@/features/casino/components/chess-app/lichess-round";

describe("LichessRound host", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<main class="round"><div class="round__app"></div></main>',
      })
    );
  });

  it("keeps and hydrates the round host when the view arrives before the match", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <LichessRound matchId="30a4d5f7-93f6-4a86-bb9d-42c13d8257fd" seatName={null} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(container.querySelector("#main-wrap .round__app")).toBeInTheDocument();
    });
    expect(container.querySelector("#main-wrap")).toHaveStyle({ display: "none" });
  });
});
