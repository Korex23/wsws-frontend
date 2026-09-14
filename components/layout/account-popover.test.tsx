import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountPopover } from "./account-popover";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockLogout = vi.fn();
const mockLinkWithPasskey = vi.fn();

// The popover reads the session through the Decane-backed seam and the kit's
// own hooks (passkey linking), replacing Privy's usePrivy/useLogout/useLinkWithPasskey.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0x0000000000000000000000000000000000000001",
    solanaAddress: null,
    profile: { name: "Test User", email: "test@example.com", avatarSeed: "did:privy:test" },
    logout: mockLogout,
  }),
}));

vi.mock("decane-connect-kit", () => ({
  useSocialAuth: () => ({ canUsePasskey: false }),
  useSocialWallet: () => ({ addPasskey: mockLinkWithPasskey }),
}));

// The migration door needs a query client and the whole venue-adapter graph;
// neither is what this test is about.
vi.mock("@/features/migrate", () => ({
  MoveOldMoneyEntry: () => null,
}));
vi.mock("@/components/layout/migration-adapters", () => ({
  MIGRATION_ADAPTERS: [],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/referrals", () => ({
  InviteFriendsModal: () => null,
}));

vi.mock("@/components/layout/modals/wallet-addresses", () => ({
  WalletAddresses: () => <div data-testid="wallet-addresses" />,
}));

describe("AccountPopover", () => {
  it("renders nothing when closed", () => {
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={false} onClose={() => {}} triggerRef={triggerRef} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders popover menu with user info and actions when open", () => {
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={() => {}} triggerRef={triggerRef} />);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /signOut/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /inviteFriends/i })).toBeInTheDocument();
  });

  it("calls logout when sign out is clicked", () => {
    const onClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={onClose} triggerRef={triggerRef} />);

    fireEvent.click(screen.getByRole("menuitem", { name: /signOut/i }));
    expect(mockLogout).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={onClose} triggerRef={triggerRef} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("stays mounted across an open/close cycle so it can play its exit animation", async () => {
    // The component must never early-return null on `open`: AnimatePresence
    // needs to see the closing render to play an exit frame, and an early
    // unmount skips straight past it. This asserts the component itself
    // reaches its own return regardless of `open`, and that the menu is
    // eventually removed once the exit completes.
    const triggerRef = { current: document.createElement("button") };
    const { rerender } = render(
      <AccountPopover open={true} onClose={() => {}} triggerRef={triggerRef} />
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(<AccountPopover open={false} onClose={() => {}} triggerRef={triggerRef} />);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
