# Implementation Plan: Portfolio Advisor Module

**Branch**: `main` | **Date**: 2026-05-24 | **Spec**: [spec.md](spec.md)

**Input**: `specs/015-portfolio-advisor/spec.md` (derived from `docs/trading-PRD.md`)

---

## Summary

Add an AI-powered portfolio advisor as a `premium_plus`-gated module within Sojourn. Users enter US stock holdings and cash, configure risk preferences and a recurring schedule, and trigger analysis runs that fan out 7 specialized AI agents in parallel via Inngest. The synthesizer aggregates agent outputs into a target allocation with an implied buy/sell action list. Completed runs trigger a Haiku summarization job and, for scheduled runs, a Resend completion email.

The module is delivered as 12 independent vertical slices — each slice is end-to-end deployable and testable before the next begins.

---

## Technical Context

**Language/Version**: TypeScript 5, Node.js 24, Next.js 16 App Router, React 19

**Primary Dependencies**:
- Existing: `@supabase/ssr`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `zod`, `resend`
- New: `inngest`

**Storage**: Supabase (Postgres). 5 new tables + 1 column on `user_profiles`.

**Testing**: Vitest — pure functions only. New tests: `portfolioCalculator.test.ts`.

**Target Platform**: Vercel (Next.js App Router)

**Performance Goals**: Agent fan-out completes in < 3 minutes. Polling endpoint responds in < 100ms.

**Constraints**:
- Polygon.io: 5 calls/minute on free tier — fetch once per run, cache in run data
- Synthesizer token budget: < 12,000 tokens input (7 agents × 500 tokens + portfolio + 5 summaries ≈ 5,600 tokens)
- Manual run cooldown: 24 hours
- US stocks only
- Portfolio data: owner-only, no assistant visibility

**Scale/Scope**: Small user base (`premium_plus` tier). 12 vertical slices.

---

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Auth-First | ✅ Pass | All `/api/portfolio/*` routes will check `supabase.auth.getUser()` first |
| II. Zod Validation | ✅ Pass | All request bodies validated with Zod before DB operations |
| III. Audit Logging | ⚠️ Scoped | Constitution names trips specifically. Portfolio writes will follow the same `logAudit()` pattern for holdings CRUD |
| IV. RBAC | ✅ Pass | New `premium_plus` role added; all portfolio routes enforce it. No `on_behalf_of` — portfolio is owner-only |
| V. Pure-Function Tests | ✅ Pass | `portfolioCalculator.ts` (action list + position sizing) covered by unit tests |

**Constitution IV note**: The constitution currently documents two roles (`main`, `assistant`). The codebase already has `premium` as a third role. Adding `premium_plus` is consistent with the existing pattern. No constitution amendment required — the principle is about enforcement, not an exhaustive role list.

---

## Project Structure

### Documentation (this feature)

```text
specs/015-portfolio-advisor/
├── plan.md              ← this file
├── spec.md              ← PRD copy
├── research.md          ← Phase 0: API research, Inngest pattern, token budget
├── data-model.md        ← Phase 1: schema, TypeScript types, JSONB shapes
├── quickstart.md        ← Phase 1: local setup and testing
├── contracts/
│   └── api.md           ← Phase 1: all API route contracts + Inngest functions
└── tasks.md             ← Phase 2: /speckit-tasks output (not yet created)
```

### Source Code

```text
src/
  app/
    portfolio/
      page.tsx                              # Overview: holdings summary + last recommendation card
      settings/
        page.tsx                            # Risk profile, target return, schedule config
      run/
        page.tsx                            # Trigger run + polling progress UI
      recommendations/
        page.tsx                            # History list
        [id]/
          page.tsx                          # Full recommendation detail
    api/
      inngest/
        route.ts                            # Inngest serve handler (GET/POST/PUT)
      portfolio/
        tos-accept/
          route.ts                          # POST — accept financial T&C
        holdings/
          route.ts                          # GET + POST holdings
          [id]/
            route.ts                        # PUT + DELETE holding
        tickers/
          search/
            route.ts                        # GET — Polygon.io autocomplete proxy
        settings/
          route.ts                          # GET + PUT portfolio settings
        run/
          route.ts                          # POST — trigger analysis run
          [id]/
            progress/
              route.ts                      # GET — polling progress endpoint
        recommendations/
          route.ts                          # GET — list recommendations
          [id]/
            route.ts                        # GET — single recommendation detail

  components/
    portfolio/
      PortfolioTosGate.tsx                  # Full-screen T&C acceptance gate
      PortfolioOverview.tsx                 # Holdings list + cash summary card
      HoldingForm.tsx                       # Add/edit holding modal (with TickerAutocomplete)
      TickerAutocomplete.tsx                # Polygon.io-backed ticker search input
      PortfolioSettingsForm.tsx             # Risk profile / target return / schedule form
      RunTrigger.tsx                        # "Run Analysis" button + cooldown display
      RunProgress.tsx                       # Polling progress: 7-agent status grid
      RecommendationListCard.tsx            # Summary card for history list
      RecommendationDetail.tsx              # Full detail: summary + action list + agent breakdown
      ActionList.tsx                        # Buy/sell/hold table with $ amounts
      AgentBreakdown.tsx                    # Expandable per-agent analysis accordion

  inngest/
    client.ts                               # Inngest({ id: 'sojourn' })
    portfolioAnalysis.ts                    # Main orchestrator: fan-out 7 agents + synthesize
    portfolioSummarize.ts                   # Post-run: Haiku summarization job
    portfolioNotify.ts                      # Post-run: Resend email (scheduled runs only)
    portfolioSchedule.ts                    # Daily cron: check next_run_at and enqueue
    agents/
      macroeconomics.ts                     # Slice 3: Agent 1 — FRED macro indicators
      fedRates.ts                           # Slice 4: Agent 2 — FRED fed/rates
      geopolitics.ts                        # Slice 5: Agent 3 — NewsAPI
      sentiment.ts                          # Slice 6: Agent 4 — NewsAPI sentiment
      fundamentals.ts                       # Slice 7: Agent 5 — SEC EDGAR
      technicalAnalysis.ts                  # Slice 8: Agent 6 — Polygon.io OHLCV
      sectorAnalysis.ts                     # Slice 9: Agent 7 — Polygon.io sector
    dataSources/
      fred.ts                               # FRED API connector
      newsapi.ts                            # NewsAPI connector
      edgar.ts                              # SEC EDGAR connector
      polygon.ts                            # Polygon.io connector (data + ticker search)
    synthesizer.ts                          # Aggregates 7 outputs → target allocation + action list

  lib/
    portfolioCalculator.ts                  # Pure: action list computation + position sizing
    portfolioCalculator.test.ts             # Vitest unit tests

  types/
    database.ts                             # Updated: UserRole += 'premium_plus' + portfolio types
```

---

## Vertical Delivery Plan

| Slice | Key files | Deployable outcome |
|---|---|---|
| **1 — Tier system** | `types/database.ts`, `middleware.ts`, `Nav.tsx`, `/app/agents/page.tsx`, migration | `premium_plus` role live; `/agents` re-gated; `/portfolio/*` protected; T&C gate renders |
| **2 — Portfolio management** | `portfolio_holdings`, `portfolio_settings` tables; holdings CRUD routes; ticker proxy; settings route; `PortfolioOverview`, `HoldingForm`, `TickerAutocomplete`, `PortfolioSettingsForm` | Users can build and manage their portfolio end-to-end |
| **3 — Run infra + Agent 1** | Inngest setup; `run_progress`, `recommendations` tables; run + progress routes; `portfolioAnalysis.ts` (1 agent); `macroeconomics.ts`; FRED connector; `RunTrigger`, `RunProgress` | Full async run cycle works: trigger → poll → raw macro output stored |
| **4 — Agent 2: Fed Rates** | `fedRates.ts` | Second FRED agent added to fan-out |
| **5 — Agent 3: Geopolitics** | `geopolitics.ts`, NewsAPI connector | NewsAPI wired; geopolitics agent live |
| **6 — Agent 4: Sentiment** | `sentiment.ts` | Second NewsAPI agent live |
| **7 — Agent 5: Fundamentals** | `fundamentals.ts`, SEC EDGAR connector | EDGAR wired; fundamentals agent live |
| **8 — Agent 6: Technical** | `technicalAnalysis.ts`, Polygon.io data connector | Polygon.io market data wired; technical agent live |
| **9 — Agent 7: Sector** | `sectorAnalysis.ts` | All 7 agents live |
| **10 — Synthesizer + UI** | `synthesizer.ts`, `portfolioCalculator.ts`+test, `recommendations` routes, `RecommendationDetail`, `ActionList`, `AgentBreakdown` | Full recommendation rendered with action list and per-agent breakdown |
| **11 — History + summarization** | `recommendations` list route, `recommendation_summaries` table, `portfolioSummarize.ts`, `RecommendationListCard` | History page live; summaries feed into future runs |
| **12 — Email notifications** | `portfolioNotify.ts`, `portfolioSchedule.ts`, email template in `email.ts` | Scheduled run completion emails sent via Resend |
