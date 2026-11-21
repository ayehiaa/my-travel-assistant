# Implementation Plan: Portfolio hub UX cleanup

**Spec**: ./spec.md · **Constitution**: auth-first routes, Zod, logAudit, pure tests — unaffected (UI-only change).

## Technical context
Next.js 16 App Router server components; Tailwind v4; Vitest for pure functions. No DB or API changes; no migrations;
no new env vars.

## Design
- `src/lib/portfolioHub.ts`: `SETTINGS_SECTIONS`, labels/descriptions, `parseSettingsSection` (with legacy aliases),
  `hubHref` typed params incl. `section` and `hash`, `settingsHref(section, hash?)`.
- `src/lib/portfolioStatusStrip.ts`: `buildStatusChips`, `formatCompactDuration`, `formatNextRunShort`,
  `AUTOPILOT_MODE_LABEL`.
- `src/lib/portfolioHubData.ts`: cached `getAiKey`, `getSetupChecklist` (credentials-based, no live call).
- `hub/StatusStrip.tsx` (server, never throws) rendered by `app/portfolio/page.tsx` above `HubTabs`.
- `hub/OverviewTab.tsx` slimmed; `hub/RebalanceTab.tsx` + `hub/RebalanceView.tsx` reordered;
  `hub/SettingsTab.tsx` section nav + per-section rendering; `settingsCard.ts` shared card classes.
- Link updates: setup checklist, AlpacaExecuteButton, email templates, `/portfolio/settings` redirect.
- Mobile: stacked-card variants in AlpacaResultsPanel, AlpacaOrderPreview, ShariahScreeningPanel; AgentBreakdown wraps.

## Risks
- Layout-only regressions can't be checked in a browser here (no auth/DB) → kept layouts to flex/grid with `min-w-0`,
  `overflow-x-auto` and `md:` variants; reviewed at 375px / 1280px by reading markup.
