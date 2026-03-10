// wallets.ts
import wallets from "../wallets.json" with { type: "json" };

export type WalletInfo = { id: string; name: string };

export const WALLETS: WalletInfo[] = wallets;

export function getWalletNameById(id: string): string {
  return WALLETS.find((w) => w.id === id)?.name ?? "Unknown Wallet";
}

export function getWalletIdByName(name: string): string | undefined {
  return WALLETS.find((w) => w.name.toLowerCase() === name.toLowerCase())?.id;
}
