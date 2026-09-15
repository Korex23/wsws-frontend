// Runs the plain wallet sweep against an injected signer, so the same code
// serves the one-click button (React hook) and the venue adapter (plain
// object). Per EVM chain one atomic sponsored batch, all ERC-20 transfers
// plus the full native balance, gas paid by the sponsor; on Solana one
// sponsored transaction per asset. A failure marks its assets and moves on.

import { encodeErc20Transfer } from "@/lib/deposit";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";
import type { EvmBatchCall, LegacySigner, SettleOutcome } from "@/lib/migration/types";
import type { ChainSweep } from "@/features/migrate/lib/plan";

// Either may be absent: a session can hold an EVM address and no Solana one,
// or the reverse. Each chain below needs only its own, so a missing address
// stops that chain's assets and nothing else.
export interface SweepDestinations {
  evm: string | null;
  solana: string | null;
}

const NO_EVM_DESTINATION = "Your new EVM wallet is not ready.";
const NO_SOLANA_DESTINATION = "Your new Solana wallet is not ready.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Transfer failed";
}

// Resolves to one outcome per asset id.
export async function runSweep(
  chains: ChainSweep[],
  destinations: SweepDestinations,
  signer: LegacySigner
): Promise<Map<string, SettleOutcome>> {
  const outcomes = new Map<string, SettleOutcome>();
  for (const chain of chains) {
    if (chain.kind === "evm-batch") {
      const ids = chain.assets.map((a) => a.id);
      if (!destinations.evm) {
        for (const id of ids) {
          outcomes.set(id, { ok: false, error: NO_EVM_DESTINATION, retryable: true });
        }
        continue;
      }
      // Bound here so the narrowing survives into the closure below.
      const evmDestination = destinations.evm;
      try {
        // The planner only emits evm-batch chains for sponsored networks, so
        // the registry lookup is the chain-id source of truth.
        const chainId = getSponsoredEvmChainByNetwork(chain.network)?.chainId;
        if (!chainId) throw new Error(`No chain id for network ${chain.network}`);
        const calls: EvmBatchCall[] = chain.assets.map((a) =>
          a.tokenAddress === null
            ? { to: evmDestination as `0x${string}`, value: a.amount }
            : {
                to: a.tokenAddress as `0x${string}`,
                data: encodeErc20Transfer(evmDestination, a.amount),
              }
        );
        const hash = await signer.sendBatch(calls, chainId);
        for (const id of ids) outcomes.set(id, { ok: true, txHashes: [hash] });
      } catch (error) {
        for (const id of ids) {
          outcomes.set(id, { ok: false, error: errorMessage(error), retryable: true });
        }
      }
      continue;
    }
    for (const asset of chain.assets) {
      if (!destinations.solana) {
        outcomes.set(asset.id, { ok: false, error: NO_SOLANA_DESTINATION, retryable: true });
        continue;
      }
      try {
        const signature = await signer.sendToken({
          network: asset.network,
          tokenAddress: asset.tokenAddress,
          decimals: asset.decimals,
          to: destinations.solana,
          amount: asset.amount,
        });
        outcomes.set(asset.id, { ok: true, txHashes: [signature] });
      } catch (error) {
        outcomes.set(asset.id, { ok: false, error: errorMessage(error), retryable: true });
      }
    }
  }
  return outcomes;
}
