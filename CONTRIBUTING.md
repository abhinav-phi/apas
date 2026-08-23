# Contributing to AuthentiChain

Thank you for your interest in improving AuthentiChain. This project is a supply-chain integrity platform where correctness and security properties are enforced in the database layer, not the browser. Contributions that look harmless in a typical web app — an extra table write, a client-side role check, a convenience hash computed in React — can silently break guarantees that the whole product depends on. Read this guide before writing code; it compresses the project's binding development rules into the workflow you need to follow.

> **Please discuss first.** Open an issue (or comment on an existing one) describing the change you want to make before investing significant effort. Large features, schema changes, anything touching RPCs/RLS, and anything touching the smart contract require prior agreement on approach.

By participating you agree to abide by the [Code of Conduct](#code-of-conduct).

---

## Table of Contents

- [Before You Contribute](#before-you-contribute)
- [Development Environment Setup](#development-environment-setup)
- [Repository Structure](#repository-structure)
- [Branching Strategy](#branching-strategy)
- [Coding Standards](#coding-standards)
  - [TypeScript / React](#typescript--react)
  - [Supabase / SQL / RLS](#supabase--sql--rls)
  - [RPC / SECURITY DEFINER Safety](#rpc--security-definer-safety)
  - [Cryptographic / Hash-Chain Rules](#cryptographic--hash-chain-rules)
  - [Solidity / Foundry](#solidity--foundry)
- [Testing Requirements](#testing-requirements)
- [Required Checks Before Every Push](#required-checks-before-every-push)
- [Dependency Changes](#dependency-changes)
- [Security-Sensitive Changes](#security-sensitive-changes)
- [Commit Message Conventions](#commit-message-conventions)
- [Pull Request Process](#pull-request-process)
- [Review Requirements](#review-requirements)
- [Documentation & Tracker Updates](#documentation--tracker-updates)
- [Reporting Bugs](#reporting-bugs)
- [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)
- [Code of Conduct](#code-of-conduct)
- [License](#license)

---

## Before You Contribute

1. Read the [README](README.md) for the product model, architecture, and current status.
2. Skim this guide end-to-end — especially [Security-Sensitive Changes](#security-sensitive-changes).
3. Search existing issues and pull requests before opening a new one.
4. Understand the trust model: **the browser is untrusted**. Authorization, hashing, state transitions, fraud detection, and protected mutations live in Postgres (RLS + SECURITY DEFINER RPCs). If your change moves any of that into React, it is wrong by definition.

## Development Environment Setup

Prerequisites:

- Node.js 20.19+ (22+ recommended) and npm
- A free [Supabase](https://supabase.com/) project (backend)
- Optional: MetaMask + Sepolia test ETH for anchoring work; [Foundry](https://book.getfoundry.sh/) for contract work

```bash
git clone https://github.com/abhinav-phi/apas authentichain
cd authentichain
npm ci
cp .env.example .env   # local environment file; fill in Supabase URL + anon key
```

Backend setup (SQL migrations in order, storage bucket, pg_cron/pgcrypto extensions, optional on-chain role grant) is documented step-by-step in [`MANUAL_STEPS.md`](MANUAL_STEPS.md). Do not invent your own migration order.

Start developing:

```bash
npm run dev    # http://localhost:8080
```

## Repository Structure

```
src/
├── components/          # layout/, charts/, ui/ (shadcn/Radix), shared components
├── contexts/            # AuthContext — auth state + server-assigned role
├── hooks/               # use-blockchain, use-pagination, use-debounce, use-toast
├── integrations/supabase/  # client.ts (THE only Supabase import path) + generated types.ts
├── lib/                 # hash.ts · blockchain.ts · pdf.ts · i18n.ts · utils.ts
├── pages/               # 19 route components
└── test/                # Vitest suites
supabase/
├── migrations/          # initial CLI baseline snapshot (never re-run manually)
└── v3…v10 *.sql         # ordered migration set (new migrations go here)
blockchain/product-auth-chain/   # Foundry project (ProductTracker.sol)
```

Note: the internal specification set under `docs/` (product spec, tech spec, schema, rules, tracker) is maintained separately from this public repository. Where those documents matter for a contribution, this guide or the PR review will point you to the relevant rule.

## Branching Strategy

- Branch from `main`.
- Name branches after the change type: `feat/csv-export-filters`, `fix/rate-limit-accounting`, `docs/setup-guide`, `chore/bump-vitest`.
- One logical change per branch/PR. Do not mix unrelated refactors into a feature PR.

## Coding Standards

### TypeScript / React

- **No `any`. Ever.** Use types from `@/integrations/supabase/types.ts` or declare local interfaces. Catch clauses are annotated `catch (err: unknown)` — keep it that way.
- **Single Supabase import path:** always `import { supabase } from "@/integrations/supabase/client"`. Never re-export or create second clients.
- **`useEffect` hygiene:** depend on primitives (`user?.id`, `role` string), never on objects recreated each render. Every Realtime subscription effect MUST return cleanup: `return () => supabase.removeChannel(channel);`.
- **No production logging.** Wrap debug output behind `import.meta.env.DEV`; use `console.error` only for genuine failures; surface user-facing problems with toast notifications.
- **Error handling is mandatory.** Every Supabase call handles `{ data, error }`; never `.then()` without an error path.
- **Loading states are mandatory.** Any page fetching data shows skeleton loaders.
- **Design system:** dark "Cosmic Dark" tokens only (`bg-background`, `bg-card`, semantic colors) — no white backgrounds except QR render surfaces; monospace for hashes/codes/TX values; responsive at 375 px, 768 px, 1024 px+; grids stack on mobile.
- **Pagination:** default page size 25, max 100; use `.range(from, to)`; never load unbounded lists.
- **Queries:** select specific columns where practical; batch related reads with `Promise.all()`; never query in a loop.

### Supabase / SQL / RLS

- **Every table has RLS enabled** with explicit policies. Never disable RLS, even temporarily.
- **Append-only tables stay append-only.** `supply_chain_events` and `scan_logs` get SELECT policies only — never add UPDATE/DELETE policies, not even admin-only, and never add client INSERT policies (rows are written exclusively by SECURITY DEFINER RPCs).
- **No direct client writes to protected state.** Clients hold no UPDATE grant on `products`; recall/flag/unflag/anchor/claim/trust changes go through RPCs only. Do not add `.update()` calls against protected tables from the frontend.
- **Roles are server-assigned.** Never insert/update `user_roles` from client code; roles come from the signup trigger whitelist or `admin_change_role()`.
- **Migrations** live in `supabase/`, named `v{version}_{description}.sql`, and MUST be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`). Include comments explaining each section. The baseline snapshot under `supabase/migrations/` is historical — never modify or re-run it.
- **Never trust client input in SQL:** validate in RPC bodies (ranges, formats, ownership); CHECK constraints are part of the design.

### RPC / SECURITY DEFINER Safety

Every new or modified SECURITY DEFINER function MUST:

1. Pin `SET search_path = ''` and fully schema-qualify all references (`public.products`, `auth.uid()`, `extensions.gen_random_bytes`, …).
2. Prefer built-in `pg_catalog` functions (`sha256(convert_to(...))`) over extension functions when possible — in-RPC hashing deliberately does not depend on pgcrypto.
3. Validate caller identity/role inside the function body (`auth.uid()`, `has_role(...)`); definer rights bypass RLS, so the function IS the authorization boundary.
4. Lock contended rows explicitly (`SELECT ... FOR UPDATE`) before read-modify-write sequences (see the event-hash chain and transfer flows for the pattern).
5. Return structured JSON results (`success`, typed reasons) rather than raising on business-rule violations, matching the existing RPC style.
6. Grant `EXECUTE` explicitly (usually to `authenticated` only; public access is reserved for `verify_product_secure`).

### Cryptographic / Hash-Chain Rules

- Event and transfer hashes are computed **server-side only**, inside their RPCs, using the established formulas. Client-submitted hashes are discarded — do not reintroduce client-side hashing helpers (removed deliberately; regression tests guard this).
- Never change hash formulas without a migration plan for existing chains: stored `event_hash`/`previous_event_hash` values must remain verifiable byte-for-byte.
- Preserve chain linkage: first event `previous_event_hash = NULL`, every later event references the previous hash; the partial UNIQUE index on `previous_event_hash` prevents forks — don't defeat it.
- Product codes (`PRD-XXXXXXXX`) and batch codes (`BAT-XXXXXX`) formats are fixed by rule.
- QR labels encode the verification URL (`{origin}/verify?code=…`), never a bare code.

### Solidity / Foundry

Contract work happens in `blockchain/product-auth-chain/` (Solidity ^0.8.24, Foundry, optimizer 200 runs):

- Run `forge build` and `forge test` before proposing contract changes.
- `ProductTracker.sol` is **deployed and source-verified on Sepolia** (`0xA06470E128275c5fE4410d4A712F23d54c714b68`). Any bytecode-changing modification implies a fresh deployment + Etherscan verification + updating the configured address — flag this in the PR before writing code.
- RBAC on-chain is enum-based and owner-granted (`assignRole(address,uint8)`; Manufacturer = 2). Never suggest key-based or client-side role bypasses.
- For live Sepolia calls always pass an explicit RPC: `--rpc-url $SEPOLIA_RPC_URL` (repo Makefile defaults to a local Anvil endpoint).
- Private keys and RPC secrets belong in local env files only — never in scripts, Makefiles, or commits.

## Testing Requirements

- Add or update Vitest tests for any change to pure logic in `src/lib/` (hash formats, conversions, URL builders, error mapping) and for regressions you fix.
- Existing suites: hash/code/QR format guards, blockchain helpers, auth flow logic, verify flow logic — keep them green.
- Frontend behavior changes should ship with a manual test note in the PR (which pages, which roles, what you clicked).
- SQL changes cannot be exercised by Vitest; describe the exact SQL-editor/live-DB verification performed or planned (see below).
- Contract changes require `forge test` output in the PR.

## Required Checks Before Every Push

Run the full gate sequence; a PR will not be reviewed without it:

```bash
npm run lint      # ESLint — expect 0 errors (8 pre-existing shadcn fast-refresh warnings are known)
npx tsc -b        # TypeScript project build — must be clean
npm test          # Vitest — all tests passing
npm run build     # production build (PWA precache) — must succeed
npm audit         # must report 0 vulnerabilities
```

For contract changes, additionally:

```bash
cd blockchain/product-auth-chain
forge build
forge test
```

Fix failures at the call site. Do not loosen types, disable rules, or weaken assertions to make an upgrade or refactor pass.

## Dependency Changes

Per the project's dependency-hygiene rule:

- `npm ci` and `npm run build` must complete with zero deprecation warnings — replace deprecated direct dependencies and pin stale transitive ones via `overrides` (document why in `package.json`).
- Required install scripts are approved via the `allowScripts` field — extend it deliberately, never silence advisories wholesale.
- After any dependency bump: rerun the full gate sequence above and fix breakage at call sites.
- State the motivation (CVE, deprecation, feature need) in the PR description.

## Security-Sensitive Changes

The following areas require extra care and maintainer review:

| Area | Non-negotiables |
|---|---|
| RLS / grants | No policy removals or grant widenings without a written justification in the PR |
| SECURITY DEFINER RPCs | Pinned empty `search_path`, qualified refs, in-body authorization, row locks where contended |
| Hash chain | No formula/format changes; server-side computation preserved |
| Fraud engine | Thresholds (clone ≥10 distinct devices, rapid ≥5/5 min, travel >500 km/h, rate limit 10/min) only change with a documented rationale |
| Auth/roles | No new client-side role surfaces; trigger whitelist untouched |
| Blockchain honesty | No fake TX data; Etherscan links gated on `blockchain_tx_status = 'confirmed'`; pending/failed states preserved |
| Secrets | Only `VITE_*` public values in frontend config; service-role keys nowhere near client code |

If your change affects the trust model (what an attacker can/cannot do), spell out the before/after in the PR. Disclose honestly: implemented-in-code is not the same as verified-on-live-infrastructure, and PRs must not conflate the two.

## Commit Message Conventions

Conventional commits, one logical change per commit:

```
feat: add analytics date-range export
fix: prevent duplicate realtime notification channels
chore: bump viem to 2.55.x (deprecation cleanup)
docs: expand MANUAL_STEPS storage-bucket policies
refactor(types): annotate catch clauses as unknown
test(hash): guard against client-side hasher reintroduction
```

Never: `update`, `fix stuff`, `asdfg`.

## Pull Request Process

1. **Explain the change**: what it does, why it's needed, and which issue it closes. Include screenshots/GIFs for UI changes.
2. **Update tests** for any behavior or security-relevant change (Vitest for logic; `forge test` for contracts).
3. **Update documentation** when architecture, behavior, configuration, routes, RPC signatures, database schema, environment variables, deployment steps, or security rules change — this includes `README.md` and `MANUAL_STEPS.md` (e.g., new env keys or a new migration file means the runbook gets a row).
4. **Disclose operational impact**: list any new/changed SQL migrations, environment variables, dashboard settings (storage/extensions), or on-chain steps reviewers or operators must perform.
5. **Run the full gate sequence** ([above](#required-checks-before-every-push)) and paste the results in the PR.
6. **Keep the task Tracker honest**: the internal tracker (`docs/7. Tracker.md`) is updated only when the corresponding work is *actually verified* — never mark live-database, cron, or end-to-end on-chain behavior as done because the code compiles. If you maintain the internal docs, mark items `[x]` only after execution; leave `[~]`/`[ ]` otherwise and say so in the PR.
7. **Never claim unverified infrastructure behavior.** "Applied in migration form" and "verified against the running database" are different statements; use the right one.
8. Rebase onto `main` if needed; resolve conflicts in your branch.

## Review Requirements

- Every PR receives at least one maintainer review before merge.
- **Security-sensitive changes** (table above) additionally require a reviewer who is not the author and explicitly signs off on the security implications.
- Reviewers check, at minimum: rules compliance (no `any`, RLS intact, RPC hygiene, hash discipline, dark-theme tokens, error/loading states), gate results, documentation/disclosure completeness, and whether claims match reality.
- Address feedback via additional commits; squash-merge decisions rest with the maintainer.
- CI/manual review may request a live-DB demonstration for SQL-heavy changes before approval.

## Documentation & Tracker Updates

Documentation is part of the definition of done:

- **README.md** — user-facing behavior, setup, env vars, routes/RPC table.
- **MANUAL_STEPS.md** — anything an operator must do (migrations, dashboard settings, env, on-chain steps).
- Code comments explain *why* for non-obvious security decisions (e.g., why a hash is computed server-side).
- The internal spec/tracker set is updated by maintainers; if your PR invalidates something there (schema, RPC list, fraud thresholds), call it out so it can be synchronized.

## Reporting Bugs

Open a GitHub issue with:

1. A clear title and one-paragraph summary.
2. Steps to reproduce (include the route/page, role used, and exact input, e.g., product code format).
3. Expected vs actual behavior.
4. Console/network output (redact tokens, emails, wallet addresses, and any identifiers).
5. Environment: browser + OS, and whether it reproduces on a fresh profile.

Search first; add to an existing issue rather than duplicating. Feature requests follow the same channel with a problem statement instead of repro steps.

## Reporting Security Vulnerabilities

**Do not open public issues for security problems.**

Email `[PROJECT_CONTACT_EMAIL]` with:

- Affected area (page, RPC, policy, contract function)
- Impact assessment (what an attacker gains)
- Reproduction steps or proof-of-concept
- Suggested fix, if any

You will receive an acknowledgment, followed by status updates as the issue is triaged and fixed. Coordinated disclosure is expected: please withhold public details until a fix ships and the advisory is published. Reporters of valid issues are credited unless they prefer anonymity. This project deals with product authenticity — social-engineering claims ("a manufacturer might lie") are tracked as roadmap/design topics, not vulnerabilities, unless they bypass a stated technical control.

## Code of Conduct

### Our Pledge

In the interest of fostering an open and welcoming environment, we as contributors and maintainers pledge to make participation in this project and our community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

Behavior that contributes to a positive environment:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community and the project's users
- Showing empathy toward other community members

Unacceptable behavior:

- Sexualized language or imagery, unwelcome sexual attention or advances
- Trolling, insulting or derogatory comments, personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct reasonably considered inappropriate in a professional setting

### Responsibilities and Scope

Maintainers clarify and enforce these standards and may remove, edit, or reject contributions — or temporarily/permanently ban contributors — for behavior they deem inappropriate, threatening, or harmful. This Code applies within project spaces and whenever someone officially represents the project publicly.

### Enforcement

Report unacceptable behavior to `[PROJECT_CONTACT_EMAIL]`. All complaints are reviewed and investigated with confidentiality toward the reporter. Maintainers who do not follow or enforce this Code in good faith may face temporary or permanent repercussions as determined by project leadership.

### Attribution

Adapted from the [Contributor Covenant](https://www.contributor-covenant.org), versions 1.4/2.x.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) that covers this repository.
