"use client";

// Calldata and reads for the Last Standing vault that more than one flow
// needs: the game screen settles and claims for the signed-in wallet, the
// migration does the same from the old one.

import { encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { publicClientForChain } from "@/lib/trade/receipt";
import { KING_OF_NIGHT_ABI } from "@/features/casino/lib/last-standing/king-of-night-abi";

export const VAULT_CHAIN_ID = base.id;

export function vaultAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}

export function isVaultConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS);
}

export function encodeVaultSettle(gameId: number): `0x${string}` {
  return encodeFunctionData({
    abi: KING_OF_NIGHT_ABI,
    functionName: "settle",
    args: [BigInt(gameId)],
  });
}

export function encodeVaultClaim(): `0x${string}` {
  return encodeFunctionData({ abi: KING_OF_NIGHT_ABI, functionName: "claim", args: [] });
}

// The id the next game will take; every game so far has a smaller one.
export async function readNextGameId(): Promise<number> {
  const next = await publicClientForChain(VAULT_CHAIN_ID).readContract({
    address: vaultAddress(),
    abi: KING_OF_NIGHT_ABI,
    functionName: "nextGameId",
  });
  return Number(next);
}

// ETH already credited to `owner` by a settlement, waiting for claim().
export async function readVaultPendingWithdrawal(owner: string): Promise<bigint> {
  return publicClientForChain(VAULT_CHAIN_ID).readContract({
    address: vaultAddress(),
    abi: KING_OF_NIGHT_ABI,
    functionName: "pendingWithdrawals",
    args: [owner as `0x${string}`],
  });
}
