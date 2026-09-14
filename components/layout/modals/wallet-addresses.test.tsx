import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WalletAddresses } from "./wallet-addresses";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const copied = vi.fn();
vi.mock("@/lib/clipboard", () => ({
  copyText: (value: string) => (copied(value), Promise.resolve(true)),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/network-icon", () => ({ NetworkIcon: () => null }));

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

// The component reads the Decane session rather than a provider user object,
// so the seam under test is useAuthSession.
const session = vi.fn();
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session() }));

function sessionWith({
  evm = null,
  solana = null,
}: {
  evm?: string | null;
  solana?: string | null;
}) {
  session.mockReturnValue({ evmAddress: evm, solanaAddress: solana });
}

describe("WalletAddresses", () => {
  // The gap this closes: on a phone the account sheet showed a name and an
  // email, so the answer to "where do I send funds" was to read six
  // characters out of the header and guess the rest.
  it("shows both chains the account holds", () => {
    sessionWith({ evm: EVM, solana: SOL });
    render(<WalletAddresses />);
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Solana")).toBeInTheDocument();
  });

  // Truncation is for the eye. The real value must stay reachable to a screen
  // reader, a long-press and a copy — all three read the full string.
  it("keeps the FULL address available even though it renders truncated", () => {
    sessionWith({ evm: EVM });
    render(<WalletAddresses />);
    expect(screen.getByText("0x1234…5678")).toBeInTheDocument();
    expect(screen.getByLabelText(`Base: ${EVM}`)).toHaveAttribute("title", EVM);
  });

  it("copies the whole address, not what is on screen", async () => {
    copied.mockClear();
    sessionWith({ solana: SOL });
    render(<WalletAddresses />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    expect(copied).toHaveBeenCalledWith(SOL);
  });

  it("draws nothing at all when the account has no wallet yet", () => {
    sessionWith({});
    const { container } = render(<WalletAddresses />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only the chains that exist, never an empty row", () => {
    sessionWith({ evm: EVM });
    render(<WalletAddresses />);
    expect(screen.queryByText("Solana")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
