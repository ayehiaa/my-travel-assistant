# Plan: 025 Portfolio trading hub

## Technical context
Next.js 16 App Router, React 19 server components, Supabase (RLS, user client), Alpaca REST via `src/lib/alpacaClient.ts`,
Tailwind v4, Vitest. No migrations, no new env vars, no new dependencies.

## Constitution check
- Auth first / role checks: the hub page keeps `getAuthUser()` + premium_plus + ToS gate; tab components only run
  after those checks. No new API routes.
- Zod at boundaries: unchanged routes; URL params parsed by pure allow-list parsers.
- logAudit on writes: no new writes.
- Pure-function tests next to files; no console.log.

## Structure
```
src/lib/portfolioHub.ts            pure: tab/period parsing, day change, period return, prorated target, drift,
                                   per-ticker trades, holding Shariah lookup
src/lib/activityTimeline.ts        pure: row → item builders, merge/sort, filter, paginate
src/lib/chartPath.ts               pure: SVG line/area path scaling
src/lib/alpacaClient.ts            + fetchPortfolioHistory, fetchAccount last_equity, position P&L fields
src/lib/alpacaLivePortfolio.ts     + P&L fields per holding, equity / last_equity
src/lib/portfolioHubData.ts        server: React cache()'d loaders shared by tab sections
src/app/portfolio/page.tsx         hub shell: auth, ToS, tab nav, Suspense per tab
src/app/portfolio/run|settings     redirect()
src/app/portfolio/recommendations/[id]/page.tsx  RebalanceView
src/components/portfolio/hub/      HubTabs, OverviewTab, PerformanceChart, LineChart, AllocationBars,
                                   HoldingsList (client, drawer), RebalanceTab, RebalanceView, RunAnalysisPanel
                                   (client), ProposedTrades, ActivityTab, SettingsTab, skeletons
```

## Data flow
- Overview: creds (cached) → `fetchLivePortfolio` + `fetchPortfolioHistory(period)`; Supabase: settings row, latest
  complete recommendation, last 50 executions (for trades per ticker).
- Rebalance: latest complete recommendation + its execution + credential flag + settings; `RebalanceView` is shared
  with the detail page.
- Activity: recommendations, executions, notification_log, audit_log (newest N×30 each) → `buildTimeline`.
- Settings: same reads as the old settings page.

## Risks
- Breaking execute/approve flows: components are reused unchanged; only container pages change.
- `router.refresh()` in the reused components re-renders the current URL, so the hub tab refreshes in place.
