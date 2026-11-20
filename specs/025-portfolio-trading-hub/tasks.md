# Tasks: 025 Portfolio trading hub

## Pure logic (tested)
- [x] T1 `src/lib/portfolioHub.ts` — parsers, day change, period return, prorated target, drift, trades per ticker (+ tests)
- [x] T2 `src/lib/activityTimeline.ts` — builders, merge/sort, filter, paginate (+ tests)
- [x] T3 `src/lib/chartPath.ts` — SVG path scaling (+ tests)
- [x] T4 Live portfolio P&L fields + equity/last_equity (`buildLiveSnapshot` tests extended)

## Server / data
- [x] T5 `fetchPortfolioHistory`, `fetchAccount` last_equity, position P&L fields in `alpacaClient.ts`
- [x] T6 `src/lib/portfolioHubData.ts` cached loaders

## UI
- [x] T7 Hub shell `/portfolio` + HubTabs (bottom bar mobile / top tabs desktop) + Suspense skeletons
- [x] T8 Overview tab: headline, PerformanceChart (LineChart SVG), AllocationBars, HoldingsList + drawer, autopilot
- [x] T9 Rebalance tab: RebalanceView (shared with detail page), RunAnalysisPanel, ProposedTrades
- [x] T10 Activity tab with filter chips + pagination
- [x] T11 Settings tab (moved cards)
- [x] T12 Redirects for /portfolio/run and /portfolio/settings; update internal links
- [x] T13 Nav: single Portfolio link; active on /portfolio/*
- [x] T14 Remove replaced components

## Docs / gate
- [x] T15 CLAUDE.md "Current Feature Plan"
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log; trace approve / execute / pause / settings

## Flow trace (Q1)
- Approve / reject: `ApprovalPanel` (unchanged) → `/api/portfolio/recommendations/[id]/approve|reject` → `router.refresh()`
  re-renders the Rebalance tab (or the detail page) in place. Overview "Pending approval" links to the Rebalance tab.
- Execute: `AlpacaExecuteButton` (unchanged) → preview → execute (409 / Shariah buy guard / pause / dry run enforced
  server-side, untouched) → `router.refresh()`; `AlpacaResultsPanel` polls as before.
- Pause / resume and settings saves: the Settings-tab cards are the same components calling the same API routes.
- Old URLs: `/portfolio/run` and `/portfolio/settings` redirect (e-mail links keep working).
