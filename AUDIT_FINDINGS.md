# AuthentiChain — Project Audit Findings (2026-09-03)

Full-codebase audit (frontend, blockchain layer, Supabase backend) run via three
parallel review passes, plus a live-database state reconciliation. Status per
finding reflects remediation done in commit `3b63ca3` (2026-09-03) unless
marked OPEN.

## Critical context discovered during remediation

The live Supabase database had **never** received the v7–v14 remediation
scripts — `supabase_migrations.schema_migrations` did not even exist. In
production, `record_blockchain_anchor`, `record_supply_chain_event`,
`resolve_fraud_alert`, `request_wallet_nonce`, `link_wallet_address`,
`unlink_wallet_address`, wallet tables, daily-stats automation and every v10+
policy were **absent**, so wallet linking, anchor status persistence, fraud
resolution and the supplier transfer flow were broken at runtime.

**Fixed:** all of v3–v14 are now tracked, ordered migrations
(`supabase/migrations/2026090309xxxx_*`) and were applied to the live DB via
`supabase db push` (history repaired for the original baseline first). Fresh
`db reset` / new environments now reproduce the real schema.

## P0 (fixed)

| Finding | Location | Fix |
|---|---|---|
| Wallet RPC forgeable: `link_wallet_address` only regex-checked the signature; anyone could bind any wallet `verified=true` (and steal existing bindings via its DELETE) | v9_wallet_linking.sql:106-159 | EXECUTE revoked from `authenticated`/`anon`/`public`, granted to `service_role`; client falls back never — Settings.tsx treats edge-function failure as hard failure |
| Live DB unreproducible: security fixes existed only as ad-hoc scripts; fresh env rebuilt the insecure v1 schema; several columns existed in no tracked DDL | supabase/migrations/ | v3–v14 converted to tracked migrations + `reconcile_live_schema` adds missing columns (current_owner_id, claimed_by/at, blockchain_tx_status, device_hash, scan_lat/lng), secure_token uuid→text, widened CHECKs, wallet tables |
| `products.secure_token` was UUID on live but v7/v10 RPCs write 32-hex TEXT — every verify/anchor write would crash | live DB | converted to TEXT (values preserved) |
| `fraud_alerts.alert_type` CHECK (tracked migration) lacked `cloned_product`/`impossible_travel`/`tampered_chain` — clone/travel/tamper detection would 500 on insert | original migration:133 | constraint dropped + widened (applied) |

## P1 (fixed)

| Finding | Location | Fix |
|---|---|---|
| Gas estimation always reverted: `estimateContractGas` sent no `account`, `onlyManufacturer` simulation failed every time | use-blockchain.ts:201,286 | connects first, passes `account` (both single + batch) |
| Wrong-network guard skipped when cached `chainId === null` | use-blockchain.ts:186-192 | `ensureReady` queries `eth_chainId` live from the wallet |
| `chain: null` disabled viem's chain assertion — a mainnet wallet could sign the "Sepolia" TX and burn real ETH | use-blockchain.ts:238,319 | `chain: sepolia` on both `writeContract` calls |
| Anchor status was manufacturer-asserted (client wrote `confirmed`) | v10:563-624, Products.tsx | `record_blockchain_anchor` allows clients only `pending`; confirmed/failed require `service_role` — status is written by the deployed `verify-anchor-receipt` Edge Function |
| profiles.is_verified self-grant: row-wide UPDATE policy let any user PATCH `is_verified=true` | v3:99 | UPDATE restricted to (full_name, company_name, avatar_url) + `forbid_self_verify` trigger backstop |
| Transfer status-vocabulary mismatch flagged legitimate re-scans as clones (`completed` inserts vs `accepted` exemption) | v13 vs v10 | v13 applied (pending-guard path); vocabulary now consistent through the tracked chain |
| Supplier transfer flow dead: page fetched products by `manufacturer_id`, so transferred-in products never appeared | TransferOwnership.tsx:57-61 | custody query on `current_owner_id` (with manufacturer fallback) |
| Wallet-link RPC fallback in Settings reopened the P0 hole whenever the edge function failed | Settings.tsx:156-167 | fallback removed |
| Automation RPCs granted to every authenticated user (unthrottled write amplification) | v8:158-159 | revoked; pg_cron + service_role only |

## P2 / P3 (fixed in this pass)

- RPC transport `filter(Boolean)` ran on transport objects, not URLs — empty
  env vars silently fell back to viem's default RPC while reads paid the
  primary timeout (blockchain.ts:69-72). Fixed: filter URLs first.
- Broadcast-then-record ordering: a failed pending-write after broadcast
  orphaned a paid TX (use-blockchain.ts:245). Fixed: pending record is
  best-effort; receipt wait + server verify still run.
- Batch flow: unguarded receipt wait + all-or-nothing pending records.
  Fixed: wrapped + per-product handling.
- Products recheck labeled every failure "Still pending". Fixed: real errors
  surface with a destructive toast; server function is the only status writer.

## Known-open items (need product decisions)

1. **Manufacturer self-signup**: `handle_new_user` honors `app_role` metadata,
   so anyone can self-register as `manufacturer` and mint genuine-looking
   products. Recommend: default signups to `customer`, gate `manufacturer`
   behind admin `admin_change_role` + company verification.
2. **Transfer consent step**: transfers complete instantly without recipient
   acceptance (`status='completed'` on insert) — a sender can force custody
   onto any registered email. Recommend: pending → recipient-accepted flow.
3. **scan_logs device fingerprint** uses `inet_client_addr()` — behind
   Supabase's pooler all anon scanners share one IP, collapsing the
   per-device rate limit into a global anon DoS vector. Recommend: derive
   the fingerprint from an edge function (x-forwarded-for / JWT sub).
4. **verify-anchor-receipt** checks the receipt status + contract address but
   not the TX calldata/logs — a manufacturer can confirm using any of their
   own mined TXs. Recommend: decode `ProductRegistered(productId, productHash)`
   logs and match the DB row.
5. **CORS `*`** on edge functions (cors.ts) — low risk (JWT required), but
   allowlist the app origin when convenient.

## Verified-clean during audit

- All 12 public tables RLS-enabled; policies scoped (v10/v12 chain applied).
- All SECURITY DEFINER functions pin `search_path = ''`.
- No XSS vectors (`dangerouslySetInnerHTML` only renders static theme CSS).
- Mutation paths delegate to hardened server RPCs; `admin_change_role`
  enforces admin + self-demotion/last-admin protection.
- 35/35 unit tests, strict tsc, lint clean, production build clean.
