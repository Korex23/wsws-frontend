import { describe, expect, it, vi } from "vitest";
import { runSweep } from "@/features/migrate/lib/sweep";
import type { ChainSweep, SweepAsset } from "@/features/migrate/lib/plan";
import type { LegacySigner } from "@/lib/migration/types";

const NEW_EVM = "0x0000000000000000000000000000000000000002";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function asset(id: string, network: string, tokenAddress: string | null = null): SweepAsset {
  return { id, network, tokenAddress, symbol: "USDC", decimals: 6, amount: 1_000n, valueUsd: 1 };
}

function signer(): LegacySigner {
  return {
    addresses: { evm: "0x0000000000000000000000000000000000000009", solana: "SoLold" },
    sendBatch: vi.fn(async () => "0xhash" as `0x${string}`),
    sendToken: vi.fn(async () => "solsig"),
    getEthereumProvider: vi.fn(),
  } as unknown as LegacySigner;
}

const baseChain: ChainSweep = {
  network: "base-mainnet",
  kind: "evm-batch",
  assets: [asset("usdc-base", "base-mainnet", USDC_BASE)],
};
const solanaChain: ChainSweep = {
  network: "solana-mainnet",
  kind: "solana-sequential",
  assets: [asset("sol", "solana-mainnet")],
};

describe("runSweep when a destination address is missing", () => {
  // The whole sweep used to refuse unless BOTH addresses existed, so a session
  // with no Solana address could not move its Base USDC either — blocked on an
  // address nothing in that sweep was going to use.
  it("sweeps EVM assets when there is no Solana address", async () => {
    const s = signer();
    const out = await runSweep([baseChain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc-base")).toEqual({ ok: true, txHashes: ["0xhash"] });
    expect(s.sendBatch).toHaveBeenCalledOnce();
  });

  it("sweeps Solana assets when there is no EVM address", async () => {
    const s = signer();
    const out = await runSweep([solanaChain], { evm: null, solana: "SoLnew" }, s);

    expect(out.get("sol")).toEqual({ ok: true, txHashes: ["solsig"] });
  });

  it("fails only the chain whose destination is missing", async () => {
    const s = signer();
    const out = await runSweep([baseChain, solanaChain], { evm: NEW_EVM, solana: null }, s);

    expect(out.get("usdc-base")?.ok).toBe(true);
    expect(out.get("sol")).toMatchObject({ ok: false, retryable: true });
    // Nothing is sent to an address that does not exist.
    expect(s.sendToken).not.toHaveBeenCalled();
  });

  it("does not sign anything when the needed destination is absent", async () => {
    const s = signer();
    const out = await runSweep([baseChain], { evm: null, solana: "SoLnew" }, s);

    expect(out.get("usdc-base")).toMatchObject({ ok: false, retryable: true });
    expect(s.sendBatch).not.toHaveBeenCalled();
  });
});
