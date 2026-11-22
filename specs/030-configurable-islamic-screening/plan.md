# Implementation Plan: Configurable Islamic Screening

**Spec**: `spec.md` · **Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch)

## Technical context
Next.js 16 App Router, Supabase, Inngest, Anthropic via `callClaude()`, Vitest. Constitution: auth first, Zod at
boundaries, `logAudit` on writes, pure functions tested next to the file, no console.log, migrations optional at runtime.

## Design

### Pure core — `src/lib/screeningConfig.ts` (new, tested)
- `ScreeningSettings`, `DEFAULT_SCREENING_SETTINGS`, `ScreeningSettingsSchema` (Zod, strict booleans).
- `readScreeningSettings(row)` → settings + `migration_applied` (column present). Partial / malformed → defaults per key.
- `EffectiveScreeningConfig { islamic, business, financial, stocks_only }`, `FULL_SCREENING_CONFIG`,
  `effectiveScreeningConfig(settings)`, `EffectiveScreeningConfigSchema`.
- `reviewerModeFor(cfg)` → `'full' | 'business' | 'financial' | null`.
- Labels: `screeningModeLabel`, `describeScreeningConfig`; `screeningWeakenings(before, after)` (confirmation text),
  `screeningChangeNeedsConfirm`.

### Rules — `src/lib/shariahRules.ts`
- `decideTickerVerdict(input, config = FULL)` builds three checks (`stocks_only`, `business`, `financial`), each
  `{ applied, outcome, reasons }`; verdict = every applied check passes. Full-mode reasons keep the spec-019 order.
- `buildShariahScreeningResult(..., config)` stores `config`; Zod schema accepts optional `config` / `checks`.
- `getBuyBlockReason(ticker, screening, currentConfig = FULL)` per spec US3.
- `applyShariahScreening` / `annotateActionList` take an optional label / prefix for non-Islamic exclusions.

### Prompts
- `src/lib/islamicMandate.ts`: `buildScreeningMandate(cfg)` ('' when nothing on; `ISLAMIC_MANDATE` for full);
  `withIslamicMandate(prompt, cfg = FULL)`.
- Agents (7) + synthesizer accept optional `screening` config; synthesizer ticker rules / wording conditional.
- `src/inngest/shariahReviewer.ts`: `buildReviewerSystemPrompt(cfg)` (full = spec-019 text), per-mode entry schema,
  `runShariahReviewer(tickers, apiKey, cfg)` returns `{verdicts:{}, usage:null}` with no call when mode is null.

### Pipeline — `src/inngest/portfolioAnalysis.ts`
`fetch-portfolio` reads `screening_settings` from the settings row and returns the effective config (memoised).
Financials only fetched when Islamic on; reviewer step skipped when mode null; verdicts and result use the config.

### Execution
`loadScreeningConfig(userId)` in `src/lib/tradingSafety.ts` (error → FULL). `PlanInput.screeningConfig` used by
`buildPlan` and `fetchPlanContext`; preview route and engine (`plan` step + per-order recheck) load the current config.

### Settings API + UI
- `PUT /api/portfolio/settings`: `screening_settings` + `screening_confirm`; best-effort separate update; audit
  `screening_settings_updated`; `screening_settings_warning` when column missing.
- `src/components/portfolio/ScreeningSettingsCard.tsx` (client, confirmation dialog) replaces the "Always on" card.
- Status strip chip `shariah`; Rebalance Shariah card + `ShariahScreeningPanel` show run mode and mismatch warning;
  holdings badges "Not screened" when off (`shariahBadgeFor(ticker, screening, cfg)`).

### Notifications
`detectDivestments` / `shariahHoldingsStatus` ignore screenings whose config has Islamic off, and only count failed
applied Islamic parts.

### Migration
`supabase/migrations/20261122e_screening_settings.sql`: `portfolio_settings.screening_settings jsonb` (nullable; null =
defaults) + `audit_log_action_check` full list + `screening_settings_updated`. Paste-ready
`supabase/apply_screening_settings.sql` (single transaction, pre-check that `apply_all_pending_2026-11-22.sql` ran via
`health_programme_imports`, verify query). If not applied: screening stays fully on, saving shows a warning.
