# Implementation Plan: Islamic (Shariah) Screening + Individual Stocks Only

**Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch — orchestrated build) | **Date**: 2026-11-20 | **Spec**: [spec.md](./spec.md)

## Summary

Add a code-enforced Shariah gate between the synthesizer and the saved recommendation, a separate strict AI reviewer,
a shared ISLAMIC MANDATE prompt block, buy guards in the execution routes, a screening section on the recommendation
page and a broker-side "disable margin & shorting" safeguard.

## Technical Context

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zod, Vitest
- Inngest background job `portfolio-analysis`; Anthropic SDK (same model id as the other agents)
- Polygon: `/v3/reference/tickers/{t}` (type, sic_code, market_cap) and `/vX/reference/financials` (latest filing)
- Alpaca: `PATCH /v2/account/configurations`
- Storage: `recommendations.shariah_screening jsonb` (new, optional) + `agent_outputs.shariah_review` (always)

## Constitution Check

| Principle | How it is met |
|---|---|
| I. Auth-first routes | New `account-safeguards` route: `getAuthUser()` → 401, `premium_plus` → 403, before anything else |
| II. Zod at boundaries | Safeguard body is a strict literal schema; reviewer output and stored screening JSON validated with Zod |
| III. Audit on writes | `alpaca_safeguards_applied` logged after a successful broker update |
| IV. RBAC | Existing `premium_plus` checks kept in preview / execute; 409 re-execution guard untouched |
| V. Pure tests | `shariahRules`, `allocationUtils`, `islamicMandate`, reviewer parsing/prompt, Polygon parsers, starter universe |

## Design

```
synthesize ─► validate-tickers ─► fetch-shariah-data ─► shariah-review ─► screen-and-save ─► emit-completed
 (Claude)     (Polygon exists)    (details+financials)   (Claude, strict)   (pure rules, DB)
```

- `src/lib/shariahRules.ts` (pure): `isCommonStock`, `SIC_BLOCKLIST` / `findBlockedSic`, `computePolygonRatios`,
  `resolveRatio`, `decideTickerVerdict`, `applyShariahScreening`, `buildShariahScreeningResult`,
  `annotateActionList`, `getBuyBlockReason`, `readShariahScreening`.
- `src/lib/allocationUtils.ts` (pure): `renormaliseAllocation` (extracted from portfolioAnalysis), `capAllocation`,
  `removeTickers`.
- `src/inngest/shariahReviewer.ts`: prompt with real Polygon data, `parseReviewerResponse` (per-ticker Zod).
- `src/lib/islamicMandate.ts`: `ISLAMIC_MANDATE`, `withIslamicMandate()` used by 7 agents + synthesizer.
- Execution: preview / execute read screening via `readShariahScreening(rec)`; blocked buys are skipped.
- UI: `ShariahScreeningPanel` (Tailwind), action-list notes, settings "Always on" card, safeguard button.

## Project Structure (touched)

```
src/lib/{shariahRules,allocationUtils,islamicMandate,starterUniverse}.ts (+ tests)
src/types/shariah.ts, src/types/database.ts
src/inngest/{portfolioAnalysis,synthesizer,shariahReviewer}.ts, agents/*.ts, dataSources/polygon.ts (+ tests)
src/app/api/portfolio/alpaca/{preview,execute,account-safeguards}/route.ts
src/components/portfolio/{ShariahScreeningPanel,RecommendationDetail,ActionList,AgentBreakdown,AlpacaExecuteButton,AlpacaCredentialsForm}.tsx
src/components/audit/AuditEntry.tsx, src/app/portfolio/settings/page.tsx
supabase/migrations/20261120_shariah_screening.sql
```

## Migration safety

The column is written only in a separate update whose result is ignored. Readers use `select('*')` and fall back to
`agent_outputs.shariah_review`. Runs, the portfolio page and execution all work without the migration.

## Complexity Tracking

None — no new tables, one optional column.
