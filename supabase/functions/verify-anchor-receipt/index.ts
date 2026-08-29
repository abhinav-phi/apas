// Supabase Edge Function: verify-anchor-receipt (audit F4 residual)

/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge function: raw JSON-RPC and
   PostgREST JSON boundaries are deliberately untyped here; this file is excluded from the
   Vite app typecheck and is type-checked by Deno at deploy time. */
// Server-side confirmation of a Sepolia anchoring transaction.
//
// Why: products.blockchain_tx_status is currently manufacturer-asserted —
// the browser reports "confirmed" after waitForTransactionReceipt. This
// function independently verifies the receipt against a Sepolia RPC and
// writes the authoritative status.
//
// Deploy (see MANUAL_STEPS.md):
//   supabase functions deploy verify-anchor-receipt
//   supabase secrets set SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
//
// Request:  POST { productId: uuid, txHash: "0x…" }  (Authorization: Bearer <user JWT>)
// Response: { ok, mined, status?: "confirmed"|"failed", confirmations?, reason? }
// deno-lint-ignore-file no-explicit-any
import { CORS_HEADERS } from "../_shared/cors.ts";

const SEPOLIA_RPC = Deno.env.get("SEPOLIA_RPC_URL") ?? "https://rpc.sepolia.org";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CONTRACT_ADDRESS = Deno.env.get("ANCHOR_CONTRACT_ADDRESS"); // optional sanity check

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(SEPOLIA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message ?? "error"}`);
  return json.result;
}

async function jsonRes(body: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonRes({ ok: false, reason: "POST only" }, 405);

  try {
    // ── 1. Authenticate the caller (GoTrue) ──────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return jsonRes({ ok: false, reason: "Missing Authorization header" }, 401);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_ROLE },
    });
    if (!userRes.ok) return jsonRes({ ok: false, reason: "Invalid or expired token" }, 401);
    const user = await userRes.json();
    const userId: string | undefined = user?.id;
    if (!userId) return jsonRes({ ok: false, reason: "Could not resolve user" }, 401);

    // ── 2. Validate input ────────────────────────────────────────────
    const { productId, txHash } = await req.json().catch(() => ({}) as any);
    if (typeof productId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(productId)) {
      return jsonRes({ ok: false, reason: "Invalid productId" }, 400);
    }
    if (typeof txHash !== "string" || !TX_RE.test(txHash)) {
      return jsonRes({ ok: false, reason: "Invalid txHash" }, 400);
    }

    // ── 3. Load the product (service role, PostgREST) and check the
    //       caller really is its manufacturer with this TX recorded ──
    const prodRes = await fetch(
      `${SUPABASE_URL}/rest/v1/products?id=eq.${productId}&select=id,manufacturer_id,blockchain_tx`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
    );
    if (!prodRes.ok) return jsonRes({ ok: false, reason: "Product lookup failed" }, 500);
    const products: any[] = await prodRes.json();
    const product = products[0];
    if (!product) return jsonRes({ ok: false, reason: "Product not found" }, 404);
    if (product.manufacturer_id !== userId) {
      return jsonRes({ ok: false, reason: "Only the manufacturer can verify this anchor" }, 403);
    }
    if (product.blockchain_tx !== txHash) {
      return jsonRes({ ok: false, reason: "Recorded TX hash does not match" }, 409);
    }

    // ── 4. Read the receipt from Sepolia ─────────────────────────────
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) return jsonRes({ ok: true, mined: false, reason: "Not yet mined" });

    if (CONTRACT_ADDRESS && String(receipt.to).toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
      // TX did not target ProductTracker — never confirm an unrelated transfer
      await patchStatus(productId, "failed");
      return jsonRes({ ok: true, mined: true, status: "failed", reason: "TX not sent to the anchor contract" });
    }

    const status = receipt.status === "0x1" ? "confirmed" : receipt.status === "0x0" ? "failed" : null;
    if (!status) return jsonRes({ ok: false, reason: `Unexpected receipt status ${receipt.status}` }, 500);

    const head = await rpc("eth_blockNumber", []);
    const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1;

    await patchStatus(productId, status);

    return jsonRes({
      ok: true,
      mined: true,
      status,
      confirmations,
      blockNumber: Number(BigInt(receipt.blockNumber)),
    });
  } catch (err) {
    return jsonRes({ ok: false, reason: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

async function patchStatus(productId: string, status: "confirmed" | "failed"): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ blockchain_tx_status: status }),
  });
  if (!res.ok) throw new Error(`Status update failed: HTTP ${res.status}`);
}
