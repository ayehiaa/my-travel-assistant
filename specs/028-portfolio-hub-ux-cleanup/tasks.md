# Tasks: 028 Portfolio hub UX cleanup

## Pure logic (tested)
- [x] T1 `portfolioHub.ts` settings sections, `parseSettingsSection`, `hubHref` section/hash, `settingsHref` (+ tests)
- [x] T2 `portfolioStatusStrip.ts` chip builder + formatters (+ tests)
- [x] T3 `activityTimeline.ts` per-filter empty states (+ test)
- [x] T4 `setupChecklist.ts` links → Settings → Setup anchors (tests updated)

## UI
- [x] T5 `StatusStrip` server component, rendered above tabs in `/portfolio`
- [x] T6 Overview: account value / performance / holdings only; simplified not-connected + error states
- [x] T7 Rebalance: new order, live current vs target, run panel + autopilot line, empty state; detail page reuses it
- [x] T8 Settings: section nav (sticky desktop / chips mobile), per-section rendering, "All set ✓"
- [x] T9 Card consistency (`settingsCard.ts`) for Autopilot, Risk & safety, Notifications, AI key, Alpaca, Targets
- [x] T10 Activity + detail page polish; stacked cards for tables on mobile
- [x] T11 Skeletons updated (overview, settings)
- [x] T12 Remove `TradingStatusBanner`, `AutopilotStatus`

## Links
- [x] T13 `/portfolio/settings` → `section=setup` (or mapped `?section=`), email templates, AlpacaExecuteButton

## Docs / gate
- [x] T14 CLAUDE.md "Current Feature Plan", `.specify/feature.json`
- [x] Q1 build / test / lint; flow trace below

## Flow trace (Q1) — every action posts to the same route as before (no fetch/route lines changed in the diff)
- Approve / reject: `ApprovalPanel` → `/api/portfolio/recommendations/[id]/approve|reject` (top of Rebalance while pending).
- Execute: `AlpacaExecuteButton` → preview / execute routes; `AlpacaResultsPanel` polling unchanged (inside "Review & execute").
- Pause / resume, dry-run toggle, risk limits: `RiskSafetyCard` (Settings → Safety) → `/api/portfolio/settings` etc. unchanged.
- Autopilot change: `AutopilotCard` (Settings → Automation) → `/api/portfolio/settings`.
- Notifications save + test email: `NotificationsCard` (Settings → Notifications), unchanged.
- Alpaca connect/disconnect + safeguards: `AlpacaCredentialsForm` (Settings → Setup #alpaca), unchanged handlers.
- AI key add/remove: `AiKeyCard` (Settings → Setup #ai-key), unchanged.
- Target return / risk profile: `PortfolioSettingsForm` (Settings → Strategy) → `/api/portfolio/settings`.
- Run analysis now: `RunAnalysisPanel` → `RunTrigger` / `RunProgress` unchanged (bottom of Rebalance).
