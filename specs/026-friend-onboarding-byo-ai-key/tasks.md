# Tasks: 026 Friend onboarding + bring your own Anthropic API key

## Pure logic (tested)
- [x] T1 `src/lib/invitationRoles.ts` (+ tests)
- [x] T2 `src/lib/aiKeyResolver.ts` (+ tests)
- [x] T3 `src/lib/setupChecklist.ts` (+ tests)
- [x] T4 `src/lib/credentialCrypto.ts`; `alpacaCrypto.ts` re-exports (+ round-trip test)

## Database
- [x] T5 `supabase/migrations/20261121_friend_onboarding_byo_ai_key.sql`
- [x] T6 `supabase/apply_friend_onboarding_2026-11-21.sql` (single transaction, pre-checks, verify)
- [x] T7 `AuditAction` += `ai_key_connected`, `ai_key_disconnected`; `CustomerInvitation.role`

## Feature 1 — invitations
- [x] T8 `POST/GET /api/customer-invitations`: role Zod + grant check + column probe + role in list
- [x] T9 Resend + `sendCustomerInvitationEmail` role features
- [x] T10 Signup inserts the capped invitation role
- [x] T11 `CustomerInviteManager` role select + role chip

## Feature 2 — Alpaca guide + checklist
- [x] T12 `AlpacaSetupGuide` in `AlpacaCredentialsForm` (not connected)
- [x] T13 `GettingStartedChecklist` on the Overview

## Feature 3 — BYO Anthropic key
- [x] T14 `src/lib/aiKeyStore.ts` (status, save, delete, resolve, verify)
- [x] T15 `POST/DELETE /api/portfolio/ai-key` (+ audit)
- [x] T16 `callClaude` requires `apiKey`; 401/403 non-retriable; redaction
- [x] T17 Thread `apiKey` through 7 agents, synthesizer, Shariah reviewer, `portfolioAnalysis.ts`
- [x] T18 `startAnalysisRun` `no_ai_key`; run route 400; scheduler skips
- [x] T19 `AiKeyCard` in the Settings tab

## Docs + quality gate
- [x] T20 CLAUDE.md "Current Feature Plan"; spec decisions
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log

## Quality gate results (2026-11-21)
- `npm run build` ✓ · `npm test` ✓ 42 files / 542 tests (34 new) · `npm run lint` ✓ 0 errors (1 pre-existing warning:
  unused `isPaper` in alpacaClient.ts)
