// Supabase Edge Function: verify-wallet-link (audit MEDIUM #7)

/* eslint-disable @typescript-eslint/no-explicit-any -- Deno edge function: raw JSON-RPC and
   PostgREST JSON boundaries are deliberately untyped here; this file is excluded from the
   Vite app typecheck and is type-checked by Deno at deploy time. */
// Server-side ECDSA verification of the wallet-linking signature.
//
// Why: `link_wallet_address` only FORMAT-checks the signature (^0x…130$) — the
// real ECDSA verify happened in the browser (viem), so anyone calling the RPC
// directly could bind ANY wallet address to their account without ever
// controlling its private key. This function recovers the signer from the
// signed message and only then persists the verified mapping via the service
// role, making "verified wallet" a server-attested fact.
//
// Deploy (see MANUAL_STEPS.md §D5):
//   supabase functions deploy verify-wallet-link
//
// Request:  POST { walletAddress, nonce, signature, chainId? }  (Authorization: Bearer <user JWT>)
// Response: { ok, wallet_address?, chain_id?, reason? }
// deno-lint-ignore-file no-explicit-any
import { verifyMessage } from "npm:ethers@6";
import { CORS_HEADERS } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_CHAIN_ID = 11155111; // Sepolia

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SIG_RE = /^0x[0-9a-fA-F]{130}$/;

// Must byte-for-byte match the string signed in Settings.handleLinkWallet
const message = (nonce: string) => `AuthentiChain wallet verification\nNonce: ${nonce}`;

async function jsonRes(body: unknown, status = 200): Promise<Response> {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function postgrest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init?.headers ?? {}),
    },
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
    const { walletAddress, nonce, signature, chainId } = await req.json().catch(() => ({}) as any);
    if (typeof walletAddress !== "string" || !ADDR_RE.test(walletAddress)) {
      return jsonRes({ ok: false, reason: "Invalid wallet address" }, 400);
    }
    if (typeof nonce !== "string" || !nonce) {
      return jsonRes({ ok: false, reason: "Missing nonce" }, 400);
    }
    if (typeof signature !== "string" || !SIG_RE.test(signature)) {
      return jsonRes({ ok: false, reason: "Invalid signature format" }, 400);
    }

    const wallet = walletAddress.toLowerCase();

    // ── 3. Load + validate the nonce (single-use, address-bound, unexpired) ──
    const nonceRes = await fetch(
      `${SUPABASE_URL}/rest/v1/wallet_nonces?wallet_address=eq.${wallet}&nonce=eq.${encodeURIComponent(nonce)}&select=id,expires_at,consumed_at`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
    );
    if (!nonceRes.ok) return jsonRes({ ok: false, reason: "Nonce lookup failed" }, 500);
    const rows: any[] = await nonceRes.json();
    const row = rows[0];
    if (!row) return jsonRes({ ok: false, reason: "Nonce invalid — request a new one" }, 400);
    if (row.consumed_at) return jsonRes({ ok: false, reason: "Nonce already used — request a new one" }, 400);
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return jsonRes({ ok: false, reason: "Nonce expired — request a new one" }, 400);
    }

    // ── 4. Cryptographic verification: recover the signer ────────────
    // viem's signMessage applies the EIP-191 personal_sign prefix, exactly what
    // ethers' verifyMessage expects — so both agree on the recovered address.
    let recovered: string;
    try {
      recovered = await verifyMessage(message(nonce), signature);
    } catch {
      return jsonRes({ ok: false, reason: "Signature could not be verified" }, 400);
    }
    if (recovered.toLowerCase() !== wallet) {
      return jsonRes({ ok: false, reason: "Signature does not match the wallet address" }, 400);
    }

    // ── 5. Persist the verified mapping (service role) ───────────────
    // One wallet per user, one user per wallet — mirrors link_wallet_address.
    await postgrest(`wallet_addresses?user_id=eq.${userId}`, { method: "DELETE" });
    await postgrest(`wallet_addresses?wallet_address=eq.${wallet}`, { method: "DELETE" });
    const chain = typeof chainId === "number" ? chainId : DEFAULT_CHAIN_ID;
    const insRes = await postgrest("wallet_addresses", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        wallet_address: wallet,
        chain_id: chain,
        verified: true,
        verified_at: new Date().toISOString(),
      }),
    });
    if (!insRes.ok) return jsonRes({ ok: false, reason: "Could not persist wallet link" }, 500);

    // Consume the nonce last so a failed insert can be retried with the same nonce
    await postgrest(`wallet_nonces?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    });

    return jsonRes({ ok: true, wallet_address: wallet, chain_id: chain });
  } catch (err) {
    return jsonRes({ ok: false, reason: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
