// OnChainProof — live on-chain verification for a product (ImplementationPlan 4.1.7)
// Reads ProductTracker.products(bytes32) over public RPCs (no wallet needed)
// and compares the anchored hash with the off-chain SHA-256 verification hash.
import { useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import {
  etherscanTxUrl,
  hashMatchesOnChain,
  isBlockchainConfigured,
  readOnChainProduct,
  uuidToBytes32,
} from "@/lib/blockchain";

type ProofState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "verified"; anchoredAt: number; txHash: string }
  | { kind: "mismatch" }
  | { kind: "missing" }
  | { kind: "unavailable"; message: string };

export function OnChainProof({
  productId,
  verificationHash,
  txHash,
}: {
  productId: string;
  verificationHash: string;
  txHash: string;
}) {
  const [proof, setProof] = useState<ProofState>({ kind: "hidden" });

  useEffect(() => {
    if (!isBlockchainConfigured()) return;
    let cancelled = false;
    setProof({ kind: "loading" });

    void (async () => {
      try {
        const onChain = await readOnChainProduct(uuidToBytes32(productId));
        if (cancelled) return;
        if (!onChain) {
          setProof({ kind: "missing" });
        } else if (hashMatchesOnChain(verificationHash, onChain)) {
          setProof({ kind: "verified", anchoredAt: Number(onChain.createdAt), txHash });
        } else {
          setProof({ kind: "mismatch" });
        }
      } catch (err) {
        if (!cancelled) {
          setProof({
            kind: "unavailable",
            message: err instanceof Error ? err.message : "RPC error",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, verificationHash, txHash]);

  if (proof.kind === "hidden") return null;

  if (proof.kind === "loading") {
    return (
      <div className="rounded-lg p-4 border bg-card flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
        <div>
          <p className="text-sm font-medium">Checking on-chain record…</p>
          <p className="text-xs text-muted-foreground">Reading Sepolia contract</p>
        </div>
      </div>
    );
  }

  if (proof.kind === "verified") {
    return (
      <div className="rounded-lg p-4 border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(113,255,232,0.1)" }}>
            <ShieldCheck className="w-4 h-4" style={{ color: "#71ffe8" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              Verified on-chain
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8" }}>
                Sepolia
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Anchored {new Date(proof.anchoredAt * 1000).toLocaleString()} — hash matches the contract record.
            </p>
          </div>
          <a
            href={etherscanTxUrl(proof.txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            Etherscan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    );
  }

  if (proof.kind === "mismatch") {
    return (
      <div className="rounded-lg p-4 border bg-card flex items-center gap-3" style={{ borderColor: "rgba(255,180,171,0.3)" }}>
        <XCircle className="w-5 h-5 shrink-0" style={{ color: "#ffb4ab" }} />
        <div>
          <p className="text-sm font-medium" style={{ color: "#ffb4ab" }}>On-chain hash mismatch</p>
          <p className="text-xs text-muted-foreground">
            The anchored hash on Sepolia does not match this product's verification hash.
          </p>
        </div>
      </div>
    );
  }

  if (proof.kind === "missing") {
    return (
      <div className="rounded-lg p-4 border bg-card flex items-center gap-3">
        <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Not found on-chain</p>
          <p className="text-xs text-muted-foreground">This product has no record in the Sepolia contract.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 border bg-card flex items-center gap-3">
      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-sm font-medium">On-chain check unavailable</p>
        <p className="text-xs text-muted-foreground">{proof.message}</p>
      </div>
    </div>
  );
}
