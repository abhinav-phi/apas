# AuthentiChain — Manual Steps Runbook

> **Audience:** You (the operator). Everything in this file is a step that **cannot** be
> done from code alone and must be performed by a human with dashboard/CLI access.
> **Last updated:** 23 August 2026 · Matches spec v3.x + `v10_security_remediation.sql`

---

## Step A — Supabase SQL Migrations

**Where:** Supabase Dashboard → your project → **SQL Editor** → *New query*.
Paste the **entire contents** of each file below, in this exact order, one file at a
time, and click **Run** after pasting each. Wait for "Success" before continuing.

### ✅ Run these files, in order

| # | File (in `supabase/`) | What it does |
|---|---|---|
| 1 | `v3_security_hardening.sql` | Kills RBAC self-escalation policies on `user_roles`; adds `admin_change_role()`; re-issues signup trigger |
| 2 | `v5_image_and_transfer.sql` | Adds `products.image_url`; transfer table columns/policies |
| 3 | `v6_notifications.sql` | `notifications` table + RLS + fraud-alert notify trigger (**re-run it even if applied before — it now pins `search_path = ''` on `notify_on_fraud_alert()` and is fully idempotent**) |
| 4 | `v7_server_event_rpc.sql` | Server-side event hash chain RPC; drops mock `anchor_to_blockchain`; `blockchain_tx_status`; `device_hash` |
| 5 | `v8_automation.sql` | System actor account, `expire_products_daily()`, `refresh_daily_stats()`, pg_cron schedules (**re-run: the notifications insert was fixed to use `message`/`link_url` — the old body would have aborted nightly auto-expiry**) |
| 6 | `v9_wallet_linking.sql` | Wallet ↔ account linking (`wallet_addresses`, `wallet_nonces`, nonce RPCs) |
| 7 | `v10_security_remediation.sql` | Final security state — run LAST, always: REVOKE direct product writes, scoped reads, rate limiting, anchor transition rules, `search_path = ''` everywhere |

### 🚫 Files to IGNORE / do NOT paste

| File | Why |
|---|---|
| `supabase/migrations/20260325190429_….sql` | CLI baseline snapshot — **already applied** to your project and NOT idempotent. Pasting it twice will error. Ignore unless bootstrapping a brand-new project (run once only). |
| `v3` / `v5` / `v7` function bodies | Historical — later files supersede them (`admin_change_role` → v10, `transfer_product_ownership` → v10, `verify_product_secure` → v10). Running the full files is still required for their policy/schema sections. |

### ✔ Post-migration verification queries (run in SQL Editor)

```sql
-- 1. No client-writable products (expect: UPDATE false, anon SELECT false)
SELECT has_table_privilege('authenticated', 'products', 'UPDATE') AS auth_can_update_products,
       has_table_privilege('anon', 'products', 'SELECT')          AS anon_can_read_products;

-- 2. Exactly-one-role invariant exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'user_roles' AND indexname = 'user_roles_user_id_key';

-- 3. All SECURITY DEFINER functions pin an empty search_path.
--    Every row's proconfig must contain the literal: search_path=
--    (empty value after the =). Flag any row without it.
SELECT proname, proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef;

-- 4. Cron jobs scheduled (expect 2 rows)
SELECT jobname, schedule FROM cron.job;
```

---

## Step B — Supabase Dashboard Settings

### B1. Create the `product-images` storage bucket

1. Dashboard → **Storage** → **New bucket**
2. Name: `product-images`
3. Toggle **Public bucket** → **ON** (needed so verification pages can render images via public URL)
4. File size limit: `5 MB` · Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`
5. Create.

Then go to **Storage → Policies** (or the bucket → *Policies* tab) and add:

```sql
-- Authenticated users may upload ONLY under their own folder:
--   {user_id}/…           (product images)
--   avatars/{user_id}/…   (profile avatars)
CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'avatars'
        AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);

CREATE POLICY "Users update own uploads"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] = 'avatars'
        AND (storage.foldername(name))[2] = auth.uid()::text)
  )
);
```

*(Public read needs no policy — public buckets serve objects over the CDN automatically.)*

### B2. Enable `pg_cron` (auto-expiry + nightly stats)

1. Dashboard → **Database** → **Extensions**
2. Search `pg_cron` → toggle **ENABLE** (schema: `cron`)
3. Also confirm **pgcrypto** is enabled (schema `extensions`) — required by the v8
   system-actor seeding and the v9 wallet-nonce generator.
4. Re-run `v8_automation.sql` once after enabling (it schedules both jobs):
   - `authentichain-auto-expiry` → daily 00:05 UTC
   - `authentichain-daily-stats` → daily 00:10 UTC
5. Verify: SQL Editor → `SELECT jobname, schedule FROM cron.job;` (expect 2 rows) or
   Dashboard → **Integrations → Cron runs**.

### B3. Auth URL settings (recommended)

Dashboard → **Authentication → URL Configuration**: set **Site URL** to your dev/prod
origin (e.g., `http://localhost:8080`) so email links and redirects work.

---

## Step C - Environment Configuration

Your local environment file (copied from `.env.example`) already contains working values except the optional paid RPC keys. If starting fresh, copy `.env.example` and fill in:

| Key | Required | Where to get it |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Same page → anon/public key (safe for frontend by design) |
| `VITE_SEPOLIA_RPC_URL` | recommended | Alchemy (https://www.alchemy.com) or Infura (https://infura.io) → create Sepolia app → copy HTTPS endpoint **with API key** |
| `VITE_SEPOLIA_RPC_FALLBACK_1` | recommended | Second provider's Sepolia endpoint |
| `VITE_SEPOLIA_RPC_FALLBACK_2` | optional | Defaults to `https://rpc.sepolia.org` |
| `VITE_CONTRACT_ADDRESS` | ✅ for anchoring | Already set: `0xA06470E128275c5fE4410d4A712F23d54c714b68` (source-verified on Etherscan) |
| `VITE_CHAIN_ID` | ✅ | `11155111` (Sepolia) |

Rules R3 reminder: **only** `VITE_*` public values here — never service_role keys or
private keys.. Your local environment file is git-ignored and stays machine-only.

---

## Step D — On-Chain Setup (Sepolia)

The contract is deployed & verified:
[`0xA06470E128275c5fE4410d4A712F23d54c714b68`](https://sepolia.etherscan.io/address/0xA06470E128275c5fE4410d4A712F23d54c714b68)
· Owner: `0x16c39DDF7BB70FD943f379f7165d627bEDF2D614` · Solidity 0.8.24

Roles are a custom enum on the contract: `0=None, 1=Admin, 2=Manufacturer, 3=Supplier`.
Only the contract owner can call `assignRole(address,uint8)`.

### D1. Get Sepolia testnet ETH

Your manufacturer wallet needs gas. Faucets (any one):
- https://sepoliafaucet.com (Alchemy — sign in with GitHub)
- https://www.infura.io/faucet/sepolia
- https://faucets.chain.link/sepolia
- https://sepolia-faucet.pk910.de (mine-on-web fallback)

The **owner** wallet also needs a little ETH to pay for the role-grant transaction (~0.001 ETH).

### D2. Grant the manufacturer role to YOUR wallet

Pick ONE method:

**Option 1 — Etherscan UI (easiest):**
1. Open the contract's **Write Contract** tab:
   https://sepolia.etherscan.io/address/0xA06470E128275c5fE4410d4A712F23d54c714b68#writeContract
2. **Connect to Web3** using the **owner** wallet (`0x16c3…D614`).
3. Find `assignRole` → enter:
   - `_account`: your manufacturer wallet address (`0x…`)
   - `_role`: `2` (= Manufacturer)
4. **Write** → confirm in MetaMask.
5. Verify in **Read Contract** → `roles`: enter your address → expect `2`.

**Option 2 — Foundry cast CLI:**

```bash
# From blockchain/product-auth-chain/ (or anywhere cast is installed).
# Confirm you are calling as the OWNER first:
cast call 0xA06470E128275c5fE4410d4A712F23d54c714b68 \
  "contractOwner()(address)" \
  --rpc-url $SEPOLIA_RPC_URL

# Grant Manufacturer (role = 2). Requires the OWNER private key:
cast send 0xA06470E128275c5fE4410d4A712F23d54c714b68 \
  "assignRole(address,uint8)" <YOUR_MANUFACTURER_WALLET> 2 \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $OWNER_PRIVATE_KEY

# Verify (expect 2):
cast call 0xA06470E128275c5fE4410d4A712F23d54c714b68 \
  "roles(address)(uint8)" <YOUR_MANUFACTURER_WALLET> \
  --rpc-url $SEPOLIA_RPC_URL
```

> ⚠️ The repo Makefile targets local Anvil (`http://127.0.0.1:8545`). Always pass
> `--rpc-url $SEPOLIA_RPC_URL` explicitly for live calls.

### D3. Link the wallet to your app account (in-app, one time)

In the running app: **Settings → Wallet → Link Wallet** while your MetaMask holds the
manufacturer address. This runs the signed-nonce challenge
(`request_wallet_nonce` → sign → `link_wallet_address`) and stores the verified
mapping used for on-chain-facing actions (signed-message challenge flow).

### D4. Deploy the receipt-verification Edge Function (optional but recommended)

`supabase/functions/verify-anchor-receipt` independently confirms anchoring
transactions server-side (audit F4 residual). Until it is deployed, anchor
status is manufacturer-asserted by the browser with a public-RPC fallback —
the app works either way, but deployment makes `blockchain_tx_status`
authoritative.

```powershell
supabase functions deploy verify-anchor-receipt
# Optional: pin the RPC used for receipt reads (defaults to rpc.sepolia.org)
supabase secrets set SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
# Optional: reject receipts whose TX did not target ProductTracker
supabase secrets set ANCHOR_CONTRACT_ADDRESS=0x<deployed-address>
```

The frontend calls it automatically on the "Pending" badge re-check and falls
back to a direct public-RPC read when the function is not deployed.

---

## Step E — Terminal Commands

```powershell
# 1. Install exact dependency tree (zero warnings expected)
npm ci

# 2. Unit tests (28 tests: hash formats, bytes32 conversions, wallet error mapping…)
npm run test

# 3. Lint + strict typecheck gates
npm run lint      # expect: 0 errors (8 pre-existing shadcn fast-refresh warnings)
npx tsc -b        # expect: no output, exit 0

# 4. Production build (PWA precache ~69 entries ≈ 3 MB)
npm run build

# 5. Start the dev server → http://localhost:8080
npm run dev
```

### Smoke-test flow after everything above

1. `npm run dev` → register a **manufacturer** account (role comes from the DB trigger — never picked client-side beyond the whitelist).
2. Register a product → note the `PRD-XXXXXXXX` code.
3. Products page → **Anchor** on that product → gas estimate dialog → sign in MetaMask → wait for confirmation → green **On-chain** badge appears (Etherscan link only after `confirmed`).
4. QR Codes page → scan the QR with a phone → browser opens `/verify?code=…` → auto-verifies GENUINE with timeline.
5. Settings → link wallet; upload avatar (exercises the storage policies from B1).
6. Next morning (after 00:05 UTC) check any expired products flipped status + `cron.job_run_details` shows success.

---

## Quick reference — where each manual step blocks what

| If skipped… | Symptom |
|---|---|
| Migrations (Step A) | RPCs missing → registration/recall/verify failures; security holes remain open |
| Storage bucket (B1) | Image/avatar uploads fail |
| pg_cron/pgcrypto (B2) | Auto-expiry & nightly analytics never run |
| Environment keys (C) | App won't start (Supabase) or anchoring stays disabled (contract/RPC) |
| Faucet ETH + role grant (D) | Anchor button fails with insufficient funds / `Unauthorized` revert |
| Wallet linking (D3) | On-chain actions can't be tied to your account |
| Edge Function (D4) | Anchor status stays manufacturer-asserted (public-RPC fallback still works) |
