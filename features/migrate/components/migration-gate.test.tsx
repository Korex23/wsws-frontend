// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationProgress } from "@/features/migrate/components/move-old-money-panel";

const state = vi.hoisted(() => ({
  offer: true,
  evm: "0xAbC0000000000000000000000000000000000001" as string | null,
}));

vi.mock("@/features/migrate/hooks/use-offer-migration", () => ({
  useOfferMigration: () => state.offer,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: state.evm,
    solanaAddress: null,
    profile: { name: "u", email: "", avatarSeed: "u" },
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/providers/legacy-privy-provider", () => ({
  LegacyPrivyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/migrate/components/move-old-money-sheet", () => ({
  MoveOldMoneyFrame: ({
    children,
    dismissible,
  }: {
    children: React.ReactNode;
    dismissible?: boolean;
  }) => (
    <div data-testid="frame" data-dismissible={String(dismissible)}>
      {children}
    </div>
  ),
}));
// A stand-in panel the test can drive: report progress, press the exit.
vi.mock("@/features/migrate/components/move-old-money-panel", () => ({
  MoveOldMoneyPanel: ({
    locked,
    canFinish,
    onProgress,
    onClose,
  }: {
    locked?: boolean;
    canFinish?: boolean;
    onProgress?: (p: MigrationProgress) => void;
    onClose: () => void;
  }) => (
    <div data-testid="panel" data-locked={String(locked)} data-can-finish={String(canFinish)}>
      <button onClick={() => onProgress?.({ linked: true, discovered: true, remaining: 1 })}>
        still-money
      </button>
      <button onClick={() => onProgress?.({ linked: false, discovered: true, remaining: 0 })}>
        not-linked
      </button>
      <button onClick={() => onProgress?.({ linked: true, discovered: true, remaining: 0 })}>
        all-done
      </button>
      <button onClick={onClose}>exit</button>
    </div>
  ),
}));

import { MigrationGate } from "@/features/migrate/components/migration-gate";

const KEY = "ws.migrationGateDone:0xabc0000000000000000000000000000000000001";

beforeEach(() => {
  state.offer = true;
  state.evm = "0xAbC0000000000000000000000000000000000001";
});
afterEach(() => {
  window.localStorage.clear();
});

describe("MigrationGate", () => {
  it("renders nothing when the migration is not offered", () => {
    state.offer = false;
    render(<MigrationGate adapters={[]} />);
    expect(screen.queryByTestId("frame")).not.toBeInTheDocument();
  });

  it("opens locked, and the exit does nothing while money is still on the old wallet", () => {
    render(<MigrationGate adapters={[]} />);
    expect(screen.getByTestId("frame")).toHaveAttribute("data-dismissible", "false");
    expect(screen.getByTestId("panel")).toHaveAttribute("data-locked", "true");
    fireEvent.click(screen.getByText("still-money"));
    expect(screen.getByTestId("panel")).toHaveAttribute("data-can-finish", "false");
    fireEvent.click(screen.getByText("exit"));
    expect(screen.getByTestId("frame")).toBeInTheDocument();
  });

  it("stays shut when the money moved but the link never landed", () => {
    render(<MigrationGate adapters={[]} />);
    fireEvent.click(screen.getByText("not-linked"));
    fireEvent.click(screen.getByText("exit"));
    expect(screen.getByTestId("frame")).toBeInTheDocument();
  });

  it("lets the user through once linked with nothing left, and remembers it for THIS account", () => {
    render(<MigrationGate adapters={[]} />);
    fireEvent.click(screen.getByText("all-done"));
    expect(screen.getByTestId("panel")).toHaveAttribute("data-can-finish", "true");
    fireEvent.click(screen.getByText("exit"));
    expect(screen.queryByTestId("frame")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("does not return for an account that finished, even while the service still reports funds", () => {
    window.localStorage.setItem(KEY, "1");
    render(<MigrationGate adapters={[]} />);
    expect(screen.queryByTestId("frame")).not.toBeInTheDocument();
  });

  // The old device-wide flag hid the migration from the next user of the same
  // browser. This one is keyed by account, so another account still gets it.
  it("still gates a different account on the same device", () => {
    window.localStorage.setItem(KEY, "1");
    state.evm = "0xDeF0000000000000000000000000000000000002";
    render(<MigrationGate adapters={[]} />);
    expect(screen.getByTestId("frame")).toBeInTheDocument();
  });
});
