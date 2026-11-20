# Feature Spec: 025 Portfolio trading hub

**Status**: Implemented · **Date**: 2026-11-20 · **Owner-approved design** (phase 6, final, of the autonomous build)

## Summary
Consolidate the trading UI — `/portfolio`, `/portfolio/run`, `/portfolio/recommendations/[id]` and
`/portfolio/settings` — into one tabbed hub at `/portfolio?tab=overview|rebalance|activity|settings` (default
`overview`). Mobile-first: bottom tab bar on small screens, top tabs on desktop, card layouts, Tailwind. Server
components fetch data; client components stay small. No migrations.

## User stories
1. **As the owner**, I open Portfolio and immediately see account value, today's change, cash, how I'm doing against
   my target, my allocation vs target and each holding's P&L and Shariah status.
2. **As the owner**, I review and act on the latest recommendation (approve / execute / run again) in one place.
3. **As the owner**, I see everything that happened (runs, approvals, executions, alerts, safety/settings changes) in
   one timeline, filterable.
4. **As the owner**, all trading settings live in one tab.

## Acceptance criteria
- AC1 `/portfolio?tab=…` renders four tabs; unknown/missing tab → overview. Bottom tab bar (`md:hidden`, fixed) on
  mobile, top tabs on desktop. Tab links are plain `<Link>`s (server-rendered, shareable URLs).
- AC2 **Overview**: account value (Alpaca equity), today's change $/% (`equity` vs `last_equity`), cash, PAPER/LIVE
  badge, DRY RUN badge + trading-paused banner (TradingStatusBanner); performance chart from
  `/v2/account/portfolio/history` with 1W/1M/3M/1Y toggles (`&period=`), inline SVG with `<title>`/`<desc>`; period
  return vs target return prorated (compounded) to the period; allocation current vs target bars with drift; holdings
  list with Shariah badge (✓ compliant / ⚠ flagged + reason) and unrealised P&L; holding detail drawer (P&L, avg entry,
  Shariah verdict + ratios + source, recent trades from `alpaca_executions`); autopilot + pending-approval card.
- AC3 **Rebalance**: latest complete recommendation summary; "Run analysis now" (secondary) with inline RunProgress
  (refreshes the tab on completion); current vs target bars; proposed trades with Shariah chips; excluded tickers
  with reasons; risk-check notes; collapsible "Why" (summary, agent breakdown, disagreements); run cost; approval
  panel (scheduled runs); Review & execute (existing AlpacaExecuteButton) and live results panel.
- AC4 `/portfolio/recommendations/[id]` stays as the deep-link/history page and renders the same Rebalance
  components (RebalanceView).
- AC5 **Activity**: one timeline, newest first, 30 per page, merging recommendations (trigger + cost),
  approvals/rejections/expiries, executions (status, order counts, dry run), `notification_log` (best-effort) and
  portfolio/trading `audit_log` actions. Filter chips All / Runs / Orders / Alerts / Open orders (non-terminal
  executions). Items link to the recommendation detail page when they relate to one.
- AC6 **Settings**: the existing settings cards (settings form, autopilot, risk & safety, notifications, Islamic
  screening, Alpaca connection), unchanged in behaviour.
- AC7 `/portfolio/run` → `/portfolio?tab=rebalance`; `/portfolio/settings` → `/portfolio?tab=settings` (old e-mail
  links keep working). Internal links point at the hub.
- AC8 Nav: one "Portfolio" link for premium_plus (no "Run Analysis"); active for any `/portfolio/*` path.
- AC9 ToS gate and premium_plus checks unchanged; skeleton fallbacks (Suspense) for async sections.
- AC10 No regressions: approval, execute (409 guards, Shariah buy guard, pause/dry run), pause/resume and settings
  saves use the same API routes and components; `router.refresh()` re-renders the hub tab in place.
- AC11 Pure tests: period return, prorated target, day change, drift, trades per ticker, timeline merge/sort/filter/
  paginate, chart path scaling; `buildLiveSnapshot` tests still pass + new P&L field tests.

## Decisions made autonomously
- **Tab state in the URL, server-rendered.** Tabs and chart period are links (`?tab=`, `&period=`); only the active
  tab's data is fetched. No client router state, no new API routes.
- **Chart period toggles reload the overview server-side** (no history API route). Simpler, no new auth surface;
  the chart sits in its own Suspense boundary. 1W uses hourly points, others daily.
- **Period return** uses Alpaca's deposit-adjusted `profit_loss_pct` (last point) when present, else
  last/first equity. **Prorated target** is compounded: `(1+t)^(days/365)-1` for annual targets,
  `(1+t)^(days/30.4375)-1` for monthly; nominal days 7/30/91/365.
- **Day change** is `equity − last_equity`; hidden when Alpaca returns neither value.
- **Allocation drift** = current % − target %, both against total account value (holdings + cash); cash's target is
  the remainder of 100%. Rows sorted by |drift|. Target comes from the latest complete recommendation.
- **Shariah badge** per holding from the latest complete recommendation's screening; a holding missing from the
  screening shows "Not screened" (neutral) rather than a guess.
- **Activity pagination**: page N fetches the newest N×30 rows from each source, merges, filters, slices — exact for
  every page up to the cap (10 pages). Approvals/rejections/expiries come from the recommendation's autopilot info
  (`agent_outputs.autopilot`, always written), so `recommendation_approved/rejected` audit rows are not duplicated;
  `run_triggered` and `alpaca_executed` audit rows are also omitted (the run/execution items cover them).
- **Activity recommendation query** selects `agent_outputs->autopilot` and `agent_outputs->usage` (PostgREST JSON
  paths) instead of `*` to keep the payload small and to work before/after the autopilot migration.
- **Dark mode**: the app has no dark theme; the chart uses `currentColor`/CSS variables so it follows any future one.
- **Redirects** are implemented as server `redirect()` in the old pages (keeps auth/ToS checks in one place).
- **ToS gate on the detail page**: `/portfolio/recommendations/[id]` now also redirects to `/portfolio` (which shows
  the gate) when the terms are not accepted — stricter than before, never looser.
- **Run progress survives navigation**: a run still `running` and started < 1 h ago resumes its progress panel in
  the Rebalance tab.
- **Removed** components fully replaced by the hub: `PortfolioOverview`, `RunPageClient`, `RecommendationDetail`,
  `ActionList` (their logic moved into the new tab components).

## Out of scope
- Donut chart (optional in the brief), real-time quote streaming, editing trades.
