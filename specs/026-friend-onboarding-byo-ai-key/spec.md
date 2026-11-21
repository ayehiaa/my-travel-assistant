# Feature Spec: 026 Friend onboarding + bring your own Anthropic API key

**Status**: Implemented · **Date**: 2026-11-21 · **Owner-approved goal** (invite a few friends for TESTING only)

## Summary
The owner (role `premium_plus`) wants to invite a few friends to test the app, including the Portfolio. Three parts:

1. **Role picker on customer invitations** — the inviter chooses what the new account gets (Main / Premium /
   Premium+), capped at the inviter's own role and enforced server-side.
2. **Clear Alpaca setup** — a step-by-step "How to set up Alpaca (5 minutes)" guide in the Alpaca connection card and
   a "Getting started" checklist at the top of the Portfolio Overview.
3. **Bring your own Anthropic API key** — each Portfolio user stores their own (encrypted) Anthropic API key, and their
   analysis runs are billed to that key. The app's own key is used only for the owner (by email allow-list).

## User stories
1. **As the owner**, I want to pick the role of a friend I invite, so a friend can test the Portfolio without me
   changing their role by hand in the database.
2. **As a Premium user**, I can invite customers as Main or Premium, never Premium+ (no escalation).
3. **As an invited friend**, I want a short, accurate guide to create an Alpaca paper account and get API keys.
4. **As an invited friend**, I want a checklist that tells me what is left before my first analysis.
5. **As an invited friend**, I want to add my own Anthropic API key so I pay for my own analysis runs, with a clear
   explanation of why a Claude.ai Pro/Max chat subscription cannot be used.
6. **As the owner**, I want my own runs to keep working with the app key, and nobody else's runs to use it.

## Acceptance criteria

### Feature 1 — role picker on customer invitations
- AC1.1 The invite form has a role select: **Main** (travel only), **Premium** (travel + can invite customers),
  **Premium+** (travel + Portfolio & trading), with a one-line explanation of the selected option. Only roles the
  inviter may grant are offered; default Main.
- AC1.2 `POST /api/customer-invitations` validates `role` with Zod (`main|premium|premium_plus`, default `main`) and
  returns **403** when the inviter's role cannot grant it (premium → main|premium; premium_plus → all three).
- AC1.3 Migration adds `customer_invitations.role text not null default 'main'` with CHECK (main|premium|premium_plus).
- AC1.4 Migration not applied: inviting as Main works exactly as before; any other role returns **400** with "Role
  selection needs a database update — apply supabase/apply_friend_onboarding_2026-11-21.sql, or invite as Main".
  Never silently downgraded.
- AC1.5 Signup reads the invitation's role, re-validates it (unknown → `main`) and caps it at the inviter's CURRENT
  role (an inviter who was downgraded can no longer hand out a higher role), then inserts it into `user_roles`.
- AC1.6 The invite list shows the role per invitation (missing column → "Main").
- AC1.7 The invitation email (new and resend) lists what the account includes; for Premium+ it says the Portfolio
  needs the friend's own Alpaca account and own Anthropic API key, and that it is for testing.
- AC1.8 Audit: the invite flow has no audit entry today, so none is added (no new audit action for invites).

### Feature 2 — Alpaca setup guide + Getting started checklist
- AC2.1 When Alpaca is NOT connected, the connection card shows a collapsible "How to set up Alpaca (5 minutes)" with
  7 numbered steps (sign up at alpaca.markets — paper account without funding/ID verification, live availability
  depends on country, UK residents check Alpaca's site, use Paper for testing; verify email + log in; account switcher
  says Paper; API Keys → Generate/Regenerate; copy Key ID (starts "PK") and Secret (shown once); paste, keep Paper ON,
  Connect; optional Dry run ON + "Disable margin & shorting"), plus "never share keys, including with the app owner;
  revoke any time by regenerating" and a plain link to https://alpaca.markets (`target="_blank" rel="noopener
  noreferrer"`).
- AC2.2 The Portfolio Overview shows a "Getting started" card for premium_plus users who have not finished setup:
  ① Accept terms ② Connect Alpaca (paper) ③ Add your Anthropic API key ④ Run your first analysis (dry run), each
  with ✓/pending and a link to the right tab. Hidden once all four are done.

### Feature 3 — bring your own Anthropic API key
- AC3.1 New table `user_ai_credentials` (user_id PK → auth.users, encrypted_api_key, key_iv, key_last4, provider
  default 'anthropic', created_at, updated_at). RLS enabled with **no client policies** — all access via the admin
  client in API routes / server code.
- AC3.2 Encryption via a shared AES-256-GCM helper `src/lib/credentialCrypto.ts` (same env key
  `ALPACA_CREDENTIAL_ENCRYPTION_KEY`), re-exported from `alpacaCrypto.ts` so existing imports keep working.
- AC3.3 `POST /api/portfolio/ai-key`: auth → premium_plus → Zod (string, trimmed, starts with `sk-ant-`, 20–300
  chars) → zero-cost verification `GET https://api.anthropic.com/v1/models` (`x-api-key`, `anthropic-version:
  2023-06-01`): 200 valid; 401 → 400 "Anthropic rejected this API key"; anything else (incl. network) → 502 "Could not
  verify the key with Anthropic — try again shortly". Stores encrypted key + last4; returns only
  `{ connected, provider, last4, created_at }`. Audit `ai_key_connected`. Never returns or logs the key.
- AC3.4 `DELETE /api/portfolio/ai-key`: auth → premium_plus → delete → audit `ai_key_disconnected` → 204.
- AC3.5 Migration missing: POST/DELETE return 503 "database update needed"; the Settings card shows "Database update
  needed"; key resolution falls back to the owner-email rule only.
- AC3.6 Key resolution (`src/lib/aiKeyResolver.ts`, pure + tested): the user's own key if present; else the app's
  `ANTHROPIC_API_KEY` only when the user's auth email is in `ANTHROPIC_KEY_OWNER_EMAILS` (comma-separated,
  case-insensitive, trimmed); else no key.
- AC3.7 `startAnalysisRun` refuses before creating any row when no key resolves: reason `no_ai_key` → API **400**
  "Add your Anthropic API key in Portfolio → Settings"; the scheduler skips with reason `no_ai_key`.
- AC3.8 `callClaude()` requires an `apiKey`; every portfolio-analysis call (7 agents, synthesizer, Shariah reviewer)
  passes the run owner's key, resolved inside each Inngest step from the DB. Decrypted keys are never returned from a
  step and never put in event payloads.
- AC3.9 A 401/403 from Anthropic mid-run fails the run (no retries) with "Your Anthropic API key was rejected — update
  it in Settings". (The notifications module has no run-failed type, so there is no notification — the run error is
  shown in the run UI.)
- AC3.10 Error messages are redacted of the run's key (in `callClaude` and in `sanitizeErrorMessage`).
- AC3.11 Settings tab: "Claude API key" card — connected state (provider, ••••last4, added date, Replace / Remove) or
  the guide + form. The guide states that a Claude.ai Pro/Max subscription cannot be used by apps, the console steps
  (sign up at console.anthropic.com → Billing: add credits e.g. $5 → API Keys → Create key → copy, shown once,
  starts `sk-ant-` → paste here), the estimated cost ≈ $0.15–0.30 per analysis run (spec 024 estimate) and recommends a
  monthly spend limit in the console.
- AC3.12 Tests: resolver decision, key format validation, owner-email parsing, redaction, verification-status
  classification, role-grant rules, signup role resolution, checklist builder, crypto round-trip.

## Out of scope
- Expenses receipt parsing and Gmail parsing (Haiku) keep using the app's `ANTHROPIC_API_KEY` — they are travel
  features, cheap, and not part of the Portfolio. Documented here; not changed.
- Other AI providers (`provider` column exists for later; only `anthropic` is accepted).
- A "run failed" notification type.

## Decisions made autonomously
1. **Signup caps the role at the inviter's current role.** If the inviter was downgraded after sending, the friend gets
   the highest role the inviter can still grant (or `main` when the inviter can no longer invite at all, e.g. the
   inviter's row is missing). Conservative: no privilege survives a downgrade.
2. **Missing-column detection** for `customer_invitations.role` probes the column (`select('role').limit(1)`) before
   inserting; Main invites skip the column entirely when it is missing, so behaviour is unchanged pre-migration.
3. **No audit action for invites** — the invite flow has none today; adding one would widen this phase. Only
   `ai_key_connected` / `ai_key_disconnected` are added (constraint recreated with the FULL list, `not valid` so old
   rows can never block the migration).
4. **Owner fallback requires both** the email allow-list AND `ANTHROPIC_API_KEY`. An empty/unset
   `ANTHROPIC_KEY_OWNER_EMAILS` means nobody uses the app key — after deploy the owner MUST set it (or add their own
   key) or their runs are refused with "Add your Anthropic API key".
5. **The user's own key wins over the owner fallback**, also for the owner (so the owner can test the BYO flow).
6. **401 and 403 mid-run are non-retriable** (`NonRetriableError`) so a revoked key fails fast instead of burning
   retries; other errors keep the existing retry behaviour.
7. **Verification 401 → 400, everything else → 502** (incl. 403, 429, 5xx, timeouts after 10 s). A 403 from
   `/v1/models` is treated as "could not verify" rather than invalid, to avoid rejecting a valid key on an account
   issue; a run with such a key would then fail with the clear "rejected" message.
8. **Key resolution runs inside every Claude-calling step** (9 per run) — one small DB read + decrypt each; no caching
   across steps (Inngest steps may run in separate invocations, and keys must not be memoised in step results).
9. **Checklist step ① is always ✓ on the Overview**, because the Portfolio page shows the terms gate until accepted;
   the item is still listed so the friend sees the whole path. The AI key step counts as done for the owner when the
   owner-email fallback applies ("using the app key").
10. **Migration date** `20261121` (after the 20261120* series); combined script
    `supabase/apply_friend_onboarding_2026-11-21.sql`.
11. Plain anchors (`target="_blank" rel="noopener noreferrer"`) for alpaca.markets and console.anthropic.com.

## Operational notes for the owner
- Set `ANTHROPIC_KEY_OWNER_EMAILS=<your login email>` in Vercel (Production + Preview) — otherwise your own runs are
  refused until you add a personal key in Portfolio → Settings.
- Apply `supabase/apply_friend_onboarding_2026-11-21.sql` in Supabase → SQL Editor.
- `ALPACA_CREDENTIAL_ENCRYPTION_KEY` is reused for AI keys (no new key needed).

## Known limitations / follow-ups
- Re-running the OLD `supabase/apply_trading_features_2026-11-20.sql` after this script would recreate the audit
  constraint without `ai_key_*` — the new script's pre-check enforces the order (trading features first).
- No "run failed" email; a rejected key shows as the run error only.
- The scheduler keeps a user without a key "due" and skips daily with `no_ai_key` (visible in Inngest only).
- `customer_invitations` RLS policies still name only `premium`; all invitation access goes through the service role,
  so this is unaffected.
