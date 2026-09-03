// AuthentiChain blockchain layer (TechSpec §6, ImplementationPlan 4.1)
// Sepolia via viem. Reads use a fallback RPC transport so a single
// provider outage cannot kill on-chain verification (TechSpec §8).
import {
  createPublicClient,
  createWalletClient,
  custom,
  fallback,
  http,
} from "viem";
import { sepolia } from "viem/chains";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_FAUCET_URL = "https://sepoliafaucet.com";
export const METAMASK_DOWNLOAD_URL = "https://metamask.io/download/";

const RPC_PRIMARY = import.meta.env.VITE_SEPOLIA_RPC_URL;
const RPC_FALLBACK_1 = import.meta.env.VITE_SEPOLIA_RPC_FALLBACK_1;
const RPC_FALLBACK_2 =
  import.meta.env.VITE_SEPOLIA_RPC_FALLBACK_2 ?? "https://rpc.sepolia.org";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

export function isBlockchainConfigured(): boolean {
  return Boolean(CONTRACT_ADDRESS && /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS));
}

export function etherscanTxUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** UUID (with or without dashes) → 32-byte hex word used as on-chain productId. */
export function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Cannot convert "${uuid}" to bytes32`);
  }
  return `0x${hex}`;
}

/** 64-char SHA-256 hex (CryptoJS output) → bytes32. */
export function sha256ToBytes32(hash: string): `0x${string}` {
  const hex = hash.startsWith("0x") ? hash.slice(2) : hash;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`Cannot convert hash to bytes32 (got ${hex.length} hex chars)`);
  }
  return `0x${hex.toLowerCase()}`;
}

// ── EIP-1193 provider (MetaMask & friends) ─────────────────────────────
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export function getInjectedProvider(): Eip1193Provider | null {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

// ── Clients ─────────────────────────────────────────────────────────────
export const publicClient = createPublicClient({
  chain: sepolia,
  // Filter the URL strings BEFORE wrapping: http(undefined) is truthy and used
  // to silently keep an empty transport that fell back to viem's chain default
  // while every read still paid the primary's timeout (audit P2).
  transport: fallback(
    [RPC_PRIMARY, RPC_FALLBACK_1, RPC_FALLBACK_2].filter(Boolean).map((url) => http(url)),
    { rank: false }
  ),
});

export function getWalletClient() {
  const provider = getInjectedProvider();
  if (!provider) throw new WalletError("No Ethereum wallet found in this browser", "no_wallet");
  return createWalletClient({ chain: sepolia, transport: custom(provider) });
}

// ── ABI (minimal slices used by the frontend) ──────────────────────────
export const PRODUCT_TRACKER_ABI = [
  {
    type: "function",
    name: "registerProduct",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_productId", type: "bytes32" },
      { name: "_productHash", type: "bytes32" },
      { name: "_batchId", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "registerProducts",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_productIds", type: "bytes32[]" },
      { name: "_productHashes", type: "bytes32[]" },
      { name: "_batchId", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "productExists",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "products",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "productHash", type: "bytes32" },
      { name: "manufacturer", type: "address" },
      { name: "currentOwner", type: "address" },
      { name: "status", type: "uint8" },
      { name: "batchId", type: "string" },
      { name: "createdAt", type: "uint256" },
      { name: "lastUpdated", type: "uint256" },
      { name: "scanCount", type: "uint256" },
      { name: "recalled", type: "bool" },
    ],
  },
] as const;

export interface OnChainProduct {
  productHash: `0x${string}`;
  manufacturer: `0x${string}`;
  currentOwner: `0x${string}`;
  status: number;
  batchId: string;
  createdAt: bigint;
  lastUpdated: bigint;
  scanCount: bigint;
  recalled: boolean;
}

/** Read a product's on-chain record (public RPC — no wallet needed). */
export async function readOnChainProduct(
  productId: `0x${string}`
): Promise<OnChainProduct | null> {
  if (!isBlockchainConfigured()) return null;
  // NOTE: `authorizationList: []` is required by viem 2.55.x typings
  // (ReadContractParameters declares it as a mandatory property). It is inert
  // for eth_call view reads.
  const exists = await publicClient.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: PRODUCT_TRACKER_ABI,
    functionName: "productExists",
    args: [productId],
    authorizationList: [],
  });
  if (!exists) return null;
  const data = await publicClient.readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: PRODUCT_TRACKER_ABI,
    functionName: "products",
    args: [productId],
    authorizationList: [],
  });
  return data as unknown as OnChainProduct;
}

/** Compare the off-chain SHA-256 verification hash with the anchored one. */
export function hashMatchesOnChain(
  verificationHash: string,
  onChain: OnChainProduct
): boolean {
  try {
    return sha256ToBytes32(verificationHash) === onChain.productHash.toLowerCase();
  } catch {
    return false;
  }
}

// ── Typed wallet errors (ImplementationPlan 4.1 edge cases) ────────────
export type WalletErrorCode =
  | "no_wallet"
  | "unconfigured"
  | "wrong_network"
  | "cancelled"
  | "insufficient_funds"
  | "reverted"
  | "rpc_error";

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(message: string, code: WalletErrorCode) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export function toWalletError(err: unknown): WalletError {
  if (err instanceof WalletError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lowered = message.toLowerCase();
  if (lowered.includes("user rejected") || lowered.includes("4001")) {
    return new WalletError("Transaction cancelled — you rejected the request in your wallet.", "cancelled");
  }
  if (lowered.includes("insufficient funds") || lowered.includes("exceeds the balance")) {
    return new WalletError(
      "Insufficient Sepolia ETH for gas. Top up at a Sepolia faucet and try again.",
      "insufficient_funds"
    );
  }
  if (
    lowered.includes("unrecognized chain") ||
    lowered.includes("switch chain") ||
    lowered.includes("wrong chain") ||
    lowered.includes("chainid") ||
    lowered.includes("chain id")
  ) {
    return new WalletError("Wrong network — please switch your wallet to Sepolia.", "wrong_network");
  }
  if (lowered.includes("revert")) {
    return new WalletError("The contract reverted this transaction.", "reverted");
  }
  return new WalletError(message || "Unexpected wallet error", "rpc_error");
}
