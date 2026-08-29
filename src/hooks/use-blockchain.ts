// useBlockchain — wallet connection + anchoring lifecycle
// (ImplementationPlan 4.1: wrong network, account/chain switch listeners,
//  user rejection, no-wallet CTA, gas estimation, TX status tracking)
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CONTRACT_ADDRESS,
  PRODUCT_TRACKER_ABI,
  SEPOLIA_CHAIN_ID,
  getInjectedProvider,
  getWalletClient,
  isBlockchainConfigured,
  publicClient,
  sha256ToBytes32,
  toWalletError,
  uuidToBytes32,
  WalletError,
  type Eip1193Provider,
} from "@/lib/blockchain";
import type { Hash } from "viem";

export interface WalletState {
  installed: boolean;
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  wrongNetwork: boolean;
}

export interface AnchorResult {
  txHash: string;
  status: "confirmed" | "failed";
}

export interface GasEstimate {
  gasUnits: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estEth: string;
}

const SEPOLIA_HEX_CHAIN_ID = "0x" + SEPOLIA_CHAIN_ID.toString(16);

async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts ?? [];
}

async function requestChainId(provider: Eip1193Provider): Promise<number | null> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string | undefined;
  return hex ? parseInt(hex, 16) : null;
}

export function useBlockchain() {
  const [state, setState] = useState<WalletState>({
    installed: Boolean(getInjectedProvider()),
    address: null,
    chainId: null,
    connecting: false,
    wrongNetwork: false,
  });
  // Keep the provider in a ref so listener cleanup always references the same object
  const providerRef = useRef<Eip1193Provider | null>(null);

  useEffect(() => {
    const provider = getInjectedProvider();
    providerRef.current = provider;
    if (!provider) return;

    // Silently restore an already-authorized session (no connect prompt)
    void (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const chainId = await requestChainId(provider);
        setState((s) => ({
          ...s,
          address: accounts?.[0] ?? null,
          chainId,
          wrongNetwork: chainId !== null && chainId !== SEPOLIA_CHAIN_ID,
        }));
      } catch {
        /* wallet locked or unavailable — stay disconnected */
      }
    })();

    const onAccountsChanged = (...args: never[]) => {
      const accounts = args[0] as string[] | undefined;
      setState((s) => ({ ...s, address: accounts?.[0] ?? null }));
    };
    const onChainChanged = (...args: never[]) => {
      const chainId = args[0] ? parseInt(String(args[0]), 16) : null;
      setState((s) => ({ ...s, chainId, wrongNetwork: chainId !== SEPOLIA_CHAIN_ID }));
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) throw new WalletError("No Ethereum wallet installed", "no_wallet");
    setState((s) => ({ ...s, connecting: true }));
    try {
      const accounts = await requestAccounts(provider);
      const chainId = await requestChainId(provider);
      const address = accounts[0] ?? null;
      setState((s) => ({
        ...s,
        installed: true,
        address,
        chainId,
        connecting: false,
        wrongNetwork: chainId !== null && chainId !== SEPOLIA_CHAIN_ID,
      }));
      return address;
    } catch (err: unknown) {
      setState((s) => ({ ...s, connecting: false }));
      throw toWalletError(err);
    }
  }, []);

  // wallet_switchEthereumChain → fallback wallet_addEthereumChain if Sepolia
  // has not been added to the wallet yet (ImplementationPlan 4.1.1)
  const switchToSepolia = useCallback(async (): Promise<void> => {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) throw new WalletError("No Ethereum wallet installed", "no_wallet");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
      });
    } catch (switchErr: unknown) {
      const err = switchErr as { code?: number };
      if (err.code === 4902 || err.code === -32603) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_HEX_CHAIN_ID,
              chainName: "Sepolia test network",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw toWalletError(switchErr);
      }
    }
    const chainId = await requestChainId(provider);
    setState((s) => ({ ...s, chainId, wrongNetwork: chainId !== SEPOLIA_CHAIN_ID }));
  }, []);

  // Honest disconnect (audit UX item: the button used to claim "disconnect"
  // while MetaMask stayed connected — only local state was cleared). The
  // closest honest primitive is EIP-2255 wallet_revokePermissions, which makes
  // the site lose account access in MetaMask-family wallets; it is best-effort
  // (unsupported by some wallets, user-confirmable), and local state is cleared
  // regardless so the UI never lies about being connected.
  const disconnect = useCallback(async () => {
    try {
      const eth = (
        window as unknown as {
          ethereum?: { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
        }
      ).ethereum;
      await eth?.request?.({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      // Unsupported or rejected by the user — local state is still cleared below
    }
    setState((s) => ({ ...s, address: null, chainId: null, wrongNetwork: false }));
  }, []);

  const ensureReady = useCallback(async (): Promise<string> => {
    if (!isBlockchainConfigured()) {
      throw new WalletError(
        "On-chain anchoring is not configured (missing VITE_CONTRACT_ADDRESS).",
        "unconfigured"
      );
    }
    let address = state.address;
    if (!address) address = await connect();
    if (!address) throw new WalletError("Wallet connection cancelled", "cancelled");
    if (state.chainId !== null && state.chainId !== SEPOLIA_CHAIN_ID) {
      await switchToSepolia();
    }
    return address;
  }, [state.address, state.chainId, connect, switchToSepolia]);

  // EIP-1559 cost estimate shown before the user signs
  const estimateAnchorCost = useCallback(
    async (sampleArgs: { productId: string; verificationHash: string; batchCode: string }): Promise<GasEstimate> => {
      if (!isBlockchainConfigured()) {
        throw new WalletError("Contract not configured", "unconfigured");
      }
      const gasUnits = await publicClient.estimateContractGas({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: PRODUCT_TRACKER_ABI,
        functionName: "registerProduct",
        args: [
          uuidToBytes32(sampleArgs.productId),
          sha256ToBytes32(sampleArgs.verificationHash),
          sampleArgs.batchCode,
        ],
      });
      const fee = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = fee.maxFeePerGas ?? 0n;
      const maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? 0n;
      const estEth = Number((gasUnits * maxFeePerGas) / 10n ** 12n) / 1e6; // ETH, 6dp
      return { gasUnits, maxFeePerGas, maxPriorityFeePerGas, estEth: estEth.toFixed(6) };
    },
    []
  );

  // Full anchor flow: sign → record 'pending' → wait receipt → record final status
  const anchorProduct = useCallback(
    async (product: { id: string; verificationHash: string; batchCode: string }): Promise<AnchorResult> => {
      const address = await ensureReady();
      const wallet = getWalletClient();

      let txHash: Hash;
      try {
        const [hash] = await wallet.writeContract({
          account: address as `0x${string}`,
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: PRODUCT_TRACKER_ABI,
          functionName: "registerProduct",
          args: [
            uuidToBytes32(product.id),
            sha256ToBytes32(product.verificationHash),
            product.batchCode,
          ],
          chain: null,
        });
        txHash = hash as Hash;
      } catch (err: unknown) {
        throw toWalletError(err);
      }

      const { error: rpcError } = await supabase.rpc("record_blockchain_anchor", {
        p_product_id: product.id,
        p_tx_hash: txHash,
        p_status: "pending",
      });
      if (rpcError) throw new WalletError(rpcError.message, "rpc_error");

      let status: "confirmed" | "failed" = "failed";
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        status = receipt.status === "success" ? "confirmed" : "failed";
      } catch (err: unknown) {
        // RPC timeout/drop: leave as pending — user can retry the confirmation check
        throw toWalletError(err);
      }

      const { error: statusError } = await supabase.rpc("record_blockchain_anchor", {
        p_product_id: product.id,
        p_tx_hash: txHash,
        p_status: status,
      });
      if (statusError) throw new WalletError(statusError.message, "rpc_error");

      return { txHash, status };
    },
    [ensureReady]
  );

  // Batch cost estimate (4.1 REQUIRED: show cost before submit) — simulates the
  // full registerProducts multicall so the number covers every product in the TX,
  // not a single-product sample scaled up.
  const estimateBatchAnchorCost = useCallback(
    async (
      products: { id: string; verificationHash: string }[],
      batchCode: string
    ): Promise<GasEstimate> => {
      if (!isBlockchainConfigured()) {
        throw new WalletError("Contract not configured", "unconfigured");
      }
      const ids = products.map((p) => uuidToBytes32(p.id));
      const hashes = products.map((p) => sha256ToBytes32(p.verificationHash));
      const gasUnits = await publicClient.estimateContractGas({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: PRODUCT_TRACKER_ABI,
        functionName: "registerProducts",
        args: [ids, hashes, batchCode],
      });
      const fee = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = fee.maxFeePerGas ?? 0n;
      const maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? 0n;
      const estEth = Number((gasUnits * maxFeePerGas) / 10n ** 12n) / 1e6; // ETH, 6dp
      return { gasUnits, maxFeePerGas, maxPriorityFeePerGas, estEth: estEth.toFixed(6) };
    },
    []
  );

  // Batch variant for CSV bulk imports — one transaction via registerProducts
  const anchorProductsBatch = useCallback(    async (
      products: { id: string; verificationHash: string }[],
      batchCode: string
    ): Promise<AnchorResult> => {
      const address = await ensureReady();
      const wallet = getWalletClient();
      const ids = products.map((p) => uuidToBytes32(p.id));
      const hashes = products.map((p) => sha256ToBytes32(p.verificationHash));

      let txHash: Hash;
      try {
        const [hash] = await wallet.writeContract({
          account: address as `0x${string}`,
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: PRODUCT_TRACKER_ABI,
          functionName: "registerProducts",
          args: [ids, hashes, batchCode],
          chain: null,
        });
        txHash = hash as Hash;
      } catch (err: unknown) {
        throw toWalletError(err);
      }

      const receipts = await Promise.all(
        products.map((p) =>
          supabase.rpc("record_blockchain_anchor", {
            p_product_id: p.id,
            p_tx_hash: txHash,
            p_status: "pending",
          })
        )
      );
      const firstError = receipts.find((r) => r.error);
      if (firstError?.error) throw new WalletError(firstError.error.message, "rpc_error");

      let status: "confirmed" | "failed" = "failed";
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      status = receipt.status === "success" ? "confirmed" : "failed";

      await Promise.all(
        products.map((p) =>
          supabase.rpc("record_blockchain_anchor", {
            p_product_id: p.id,
            p_tx_hash: txHash,
            p_status: status,
          })
        )
      );

      return { txHash, status };
    },
    [ensureReady]
  );

  return {
    ...state,
    configured: isBlockchainConfigured(),
    connect,
    disconnect,
    switchToSepolia,
    estimateAnchorCost,
    estimateBatchAnchorCost,
    anchorProduct,
    anchorProductsBatch,
  };
}
