# Implementation Plan: 026 Friend onboarding + bring your own Anthropic API key

**Spec**: `spec.md` · **Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch, per brief)

## Constitution check
- Auth first in every API route; Zod at the boundary; `logAudit` on writes (`ai_key_connected/disconnected`).
- Pure logic in `src/lib/*` with Vitest tests next to the files; no Supabase/Next mocks.
- Trading safety untouched: no execution path changes; dry run / pause / Shariah buy guard unaffected.
- Migration-optional: every new column/table is read defensively; the app keeps working before the SQL is applied.

## Modules

### Pure (tested)
| File | Purpose |
|---|---|
| `src/lib/invitationRoles.ts` | invitable roles, labels/descriptions, `allowedInviteRoles`, `canGrantRole`, `readInvitationRole`, `resolveSignupRole`, `invitationRoleFeatures`, `isMissingSchemaError` |
| `src/lib/aiKeyResolver.ts` | `AnthropicApiKeySchema`, `isValidAnthropicKeyFormat`, `keyLast4`, `parseOwnerEmails`, `isOwnerEmail`, `resolveAiKey`, `classifyKeyVerification`, `redactSecrets`, `AI_KEY_REJECTED_MESSAGE`, `NO_AI_KEY_MESSAGE` |
| `src/lib/setupChecklist.ts` | `buildSetupChecklist` for the Overview "Getting started" card |
| `src/lib/credentialCrypto.ts` | AES-256-GCM encrypt/decrypt (moved from `alpacaCrypto.ts`, which re-exports) |

### Server
| File | Change |
|---|---|
| `src/lib/aiKeyStore.ts` | admin-client access to `user_ai_credentials`: status, save, delete, load+decrypt, `resolveAiKeyForUser`, `requireRunApiKey` (NonRetriableError when none), `verifyAnthropicKey` (fetch /v1/models, 10 s timeout) |
| `src/app/api/portfolio/ai-key/route.ts` | POST / DELETE |
| `src/lib/aiCall.ts` | `apiKey` required; 401/403 → `NonRetriableError(AI_KEY_REJECTED_MESSAGE)`; other errors re-thrown with the key redacted |
| agents ×7, `synthesizer.ts`, `shariahReviewer.ts` | accept + pass `apiKey` |
| `src/inngest/portfolioAnalysis.ts` | resolve the key inside each Claude-calling step; `sanitizeErrorMessage(err, extra)` |
| `src/lib/startAnalysisRun.ts` | `no_ai_key` reason checked before any write |
| `src/app/api/portfolio/run/route.ts` | `no_ai_key` → 400 |
| `src/app/api/customer-invitations/route.ts` | role in Zod, grant check (403), column probe, role in list |
| `src/app/api/customer-invitations/resend/route.ts` | email mentions role |
| `src/app/api/auth/signup/route.ts` | role from invitation, capped by inviter's current role |
| `src/lib/email.ts` | `sendCustomerInvitationEmail({ role })` features list |

### UI (Tailwind)
| File | Change |
|---|---|
| `src/components/settings/CustomerInviteManager.tsx` | role select + explanation; role chip per invite |
| `src/components/portfolio/AlpacaSetupGuide.tsx` | `<details>` collapsible 7-step guide |
| `src/components/portfolio/AlpacaCredentialsForm.tsx` | shows guide when not connected |
| `src/components/portfolio/AiKeyCard.tsx` | Claude API key card (status / guide / form / replace / remove) |
| `src/components/portfolio/hub/GettingStartedChecklist.tsx` | Overview checklist |
| `src/components/portfolio/hub/SettingsTab.tsx`, `OverviewTab.tsx` | wire the above |

### Database
- `supabase/migrations/20261121_friend_onboarding_byo_ai_key.sql` — `customer_invitations.role`, `user_ai_credentials`
  (RLS on, no client policies), audit constraint FULL list + 2 new actions.
- `supabase/apply_friend_onboarding_2026-11-21.sql` — same, single transaction, pre-checks, verify query.

## Data flow (analysis run)
`POST /api/portfolio/run` → `startAnalysisRun` → `resolveAiKeyForUser` (no key → `no_ai_key`, nothing written) →
event `{ run_id, user_id, trigger }` (no key) → each Claude step: `requireRunApiKey(user_id)` → `runXAgent({ …, apiKey })`
→ `callClaude({ …, apiKey })`. Steps return only outputs + usage.

## Risks
- Owner forgets `ANTHROPIC_KEY_OWNER_EMAILS` → owner runs refused with a clear message (safe failure).
- Table missing → status reads "database update needed", resolution = owner rule only.
