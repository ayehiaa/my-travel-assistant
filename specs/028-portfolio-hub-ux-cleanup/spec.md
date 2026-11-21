# Feature Specification: Portfolio hub UX cleanup

**Feature Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch — orchestrated run)
**Created**: 2026-11-21
**Status**: Implemented
**Input**: Owner-approved UX restructure of the Portfolio hub — presentation only, NO behaviour changes.

## User Scenarios & Testing

### US1 — See account status at a glance on every tab (P1)
A global status strip above the tabs shows compact chips only when relevant: PAPER/LIVE (when connected), DRY RUN
(purple), Autopilot mode + next run ("Autopilot: approval · next Mon 10:30 NY"), TRADING PAUSED (red, reason in the
tooltip, links to Settings → Safety), "Approval needed · expires in Xh" (links to Rebalance) and "Setup 2/4" (links to
Settings → Setup) while the getting-started checklist is incomplete.
**Acceptance**: chips appear/disappear per state; the strip never throws when data is missing (Alpaca unreachable,
migrations not applied) — a missing piece only hides its chip.

### US2 — Overview shows the account, not the controls (P1)
Overview shows only: Account value (value, today's change, cash, invested, unrealised P&L, as-of + refresh),
Performance, Holdings (Shariah badges, detail drawer, one-line flagged notice). Removed: getting-started checklist,
trading banner, autopilot status, allocation bars, latest-analysis card, PAPER/DRY RUN badges (now in the strip).
Not-connected and Alpaca-error states remain, pointing to Settings → Setup.

### US3 — Rebalance reads top-to-bottom as a decision (P1)
Order: pending approval panel (if any) → summary → current vs target (moved from Overview; live weights when Alpaca is
reachable) → proposed trades → Shariah screening → risk notes → collapsible "Why" (agent breakdown) → run cost →
Review & execute + live results; then "Run analysis now" + progress + one-line autopilot status linking to
Settings → Automation. Empty state when there is no recommendation. The recommendation detail page reuses the same
layout (RebalanceView).

### US4 — Settings split into sections (P1)
`/portfolio?tab=settings&section=setup|strategy|automation|safety|notifications` (default setup). Sub-navigation is
sticky on desktop and a horizontally scrolling chip row on mobile. Only the active section renders (server-side).
- Setup: getting-started checklist (hidden when complete → small "All set ✓"), Alpaca connection (+ guide), Claude API key.
- Strategy: target return + risk profile form, Islamic screening card.
- Automation: Autopilot card. Safety: Risk & safety card. Notifications: Notifications card.
Old links keep working: `/portfolio/settings` redirects to `section=setup` (or `?section=` incl. legacy names such as
`alpaca`, `ai-key`, `autopilot`, `risk`); `#alpaca` / `#ai-key` anchors exist inside Setup. Emails link to the new
section URLs. All cards share one width (max-w-2xl column), padding, radius and heading style.

### US5 — Activity and recommendation page readable at 375px (P2)
Consistent typography/spacing, clear per-filter empty states, no horizontal overflow: tables (execution results,
order preview, Shariah screening) become stacked cards below `md`.

## Requirements
- FR-001 Pure logic in `src/lib` with tests: chip builder (`portfolioStatusStrip.ts`), section parsing / links
  (`portfolioHub.ts`: `parseSettingsSection`, `settingsHref`, `hubHref` with `section` + `hash`), activity empty states.
- FR-002 `hubHref()` stays the single URL builder for hub links.
- FR-003 No API route, request body, guard or component behaviour changes. No migrations.

## Success Criteria
- Every write flow (approve/reject, execute, pause/resume, dry run, autopilot, risk limits, notifications + test email,
  Alpaca connect/disconnect, AI key add/remove, run analysis) still renders and posts to the same route.
- build, test and lint pass.

## Decisions made autonomously
1. Chip order is by urgency (paused → approval → setup → PAPER/LIVE → DRY RUN → autopilot), not the order in the brief.
2. The strip reads stored credentials / settings only (no live Alpaca call) and is wrapped in its own Suspense with a
   null fallback so it never blocks a tab.
3. Autopilot chip is hidden when autopilot is off (the Rebalance tab still shows a one-line status incl. "Off").
4. Rebalance "current vs target" uses live Alpaca weights for the latest recommendation (as the Overview did) and falls
   back to analysis-time weights when Alpaca is unreachable; the detail page always shows analysis-time weights.
5. The approval panel goes first only while pending; a decided/expired one stays as context after the summary.
6. Shariah screening moved out of the "Why" disclosure into its own card; its excluded list replaces the duplicate
   one that was in Proposed trades.
7. `TradingStatusBanner` and `AutopilotStatus` were removed (replaced by the strip / one-line status); no other users.
8. The paused-trading and resumed emails link to Settings → Safety; the footer links to Settings → Notifications.
9. Inline styles converted only on card wrappers (shared `settingsCard.ts` classes); form internals untouched.
