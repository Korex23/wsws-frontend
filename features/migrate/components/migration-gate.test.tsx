// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MigrationProgress } from "@/features/migrate/components/move-old-money-panel";

const state = vi.hoisted(() => ({
  offer: true,
  evm: "0xAbC0000000000000000000000000000000000001" as string | null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
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
vi.mock("@/features/migrate/components/migration-gate-header", () => ({
  MigrationGateHeader: () => <div data-testid="header" />,
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
// A stand-in panel the test drives: report a progress shape, or press onClose.
vi.mock("@/features/migrate/components/move-old-money-panel", () => ({
  MoveOldMoneyPanel: ({
    locked,
    onProgress,
    onClose,
  }: {
    locked?: boolean;
    onProgress?: (p: MigrationProgress) => void;
    onClose: () => void;
  }) => {
    const emit = (p: Partial<MigrationProgress>) =>
      onProgress?.({
        stage: "move",
        linked: true,
        discovered: true,
        remaining: 0,
        coreRemaining: 0,
        ...p,
      });
    return (
      <div data-testid="panel" data-locked={String(locked)}>
        <button onClick={() => emit({ coreRemaining: 1, remaining: 1 })}>core-left</button>
        <button onClick={() => emit({ stage: "finish", linked: false, coreRemaining: 0 })}>
          not-linked
        </button>
        <button onClick={() => emit({ coreRemaining: 0, remaining: 3 })}>
          core-done-tail-left
        </button>
        <button onClick={onClose}>panel-exit</button>
      </div>
    );
  },
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

  it("opens locked and non-dismissable, with no way out while core money is left", () => {
    render(<MigrationGate adapters={[]} />);
    expect(screen.getByTestId("frame")).toHaveAttribute("data-dismissible", "false");
    expect(screen.getByTestId("panel")).toHaveAttribute("data-locked", "true");
    fireEvent.click(screen.getByText("core-left"));
    expect(screen.queryByText("gateFinish")).not.toBeInTheDocument();
    expect(screen.getByText("gateCoreLeft")).toBeInTheDocument();
    fireEvent.click(screen.getByText("panel-exit"));
    expect(screen.getByTestId("frame")).toBeInTheDocument();
  });

  // The point of the core rule: the long tail (memecoins, perps) does not hold
  // the gate. Core moved, three tail holdings left, and the exit is offered.
  it("lets the user through once core is clear, even with the long tail remaining", () => {
    render(<MigrationGate adapters={[]} />);
    fireEvent.click(screen.getByText("core-done-tail-left"));
    expect(screen.getByText("gateFinish")).toBeInTheDocument();
    fireEvent.click(screen.getByText("gateFinish"));
    expect(screen.queryByTestId("frame")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("stays shut when core moved but the link never landed", () => {
    render(<MigrationGate adapters={[]} />);
    fireEvent.click(screen.getByText("not-linked"));
    expect(screen.queryByText("gateFinish")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("panel-exit"));
    expect(screen.getByTestId("frame")).toBeInTheDocument();
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
