import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const oauth = vi.hoisted(() => ({ returning: false }));

vi.mock("@/features/migrate/lib/oauth-return", () => ({
  get returningFromPrivyOAuth() {
    return oauth.returning;
  },
}));
vi.mock("@/features/migrate/components/move-old-money-sheet", () => ({
  MoveOldMoneySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="sheet" /> : null,
}));

const { MigrationOAuthReturn } = await import(
  "@/features/migrate/components/migration-oauth-return"
);

describe("MigrationOAuthReturn", () => {
  it("renders nothing on an ordinary page load", () => {
    oauth.returning = false;
    render(<MigrationOAuthReturn adapters={[]} />);
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("reopens the sheet when Privy hands the OAuth result back in the URL", () => {
    // Without this the code is never exchanged: the sign-in silently does not
    // happen, the credentials stay in the URL, and the money never moves.
    oauth.returning = true;
    render(<MigrationOAuthReturn adapters={[]} />);
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });
});
