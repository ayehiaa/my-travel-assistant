# PRD: AI-Powered Portfolio Advisor (Sojourn Portfolio Module)

## Context & Integration

This is a module within **Sojourn**, the expat travel management app. It is not a standalone application. It shares Sojourn's auth, database, codebase, and deployment.

### Sojourn Tier Model

| Role | Price | Features |
|---|---|---|
| `main` | Free | Flight tracking, basic expenses (up to 10 trips) |
| `premium` | Paid | Unlimited trips, full expenses, Gmail import, assistant invitations |
| `premium_plus` | Higher price | Everything in `premium` + Portfolio Advisor + Agent Pipeline demo |
| `assistant` | Linked | Read + create access on a linked `main`/`premium`/`premium_plus` account |

The portfolio module is gated to `premium_plus` only. Assistant users cannot access or view any portfolio data, regardless of the owner's tier.

### URL Structure

```
/portfolio                        ← overview (holdings summary + last recommendation card)
/portfolio/settings               ← risk profile, target return, schedule
/portfolio/run                    ← trigger run + polling-based live progress
/portfolio/recommendations        ← history list
/portfolio/recommendations/[id]   ← individual recommendation detail
```

---

## Vertical Delivery Plan

The portfolio module is built and shipped as 12 independent vertical slices. Each slice is a complete end-to-end feature that can be built, tested, and deployed to production independently before the next slice begins.

| # | Slice | Deployable outcome |
|---|---|---|
| 1 | **Tier system** | `premium_plus` role added to DB + codebase; `/agents` re-gated; `/portfolio/*` middleware; T&C gate on first visit |
| 2 | **Portfolio management** | Holdings CRUD + Polygon.io ticker autocomplete; `/portfolio` overview; `/portfolio/settings` (risk profile, target return, schedule) |
| 3 | **Run infrastructure + Agent 1: Macroeconomics** | Inngest setup; `run_progress` + `recommendations` tables; `/portfolio/run` with polling progress; first agent (Macroeconomics via FRED); raw agent output displayed |
| 4 | **Agent 2: Fed & Interest Rates** | Second FRED agent added to fan-out; recommendation output updated |
| 5 | **Agent 3: Geopolitics** | NewsAPI connector wired up; Geopolitics agent added |
| 6 | **Agent 4: Sentiment/News** | Second NewsAPI agent added to fan-out |
| 7 | **Agent 5: Fundamentals/Earnings** | SEC EDGAR connector wired up; Fundamentals agent added |
| 8 | **Agent 6: Technical Analysis** | Polygon.io market data connector wired up; Technical Analysis agent added |
| 9 | **Agent 7: Sector Analysis** | Second Polygon.io agent added — all 7 agents live |
| 10 | **Synthesizer + full recommendation UI** | Synthesizer LLM call; full recommendation detail page (`/portfolio/recommendations/[id]`); action list; per-agent breakdown; conflict resolution notes |
| 11 | **Recommendation history + summarization** | History list (`/portfolio/recommendations`); Inngest summarization job (Haiku); context injection into future synthesizer runs |
| 12 | **Email notifications** | Resend completion email for scheduled runs with CTA link |

**Agent ordering rationale:** Macroeconomics and Fed go first (FRED — no API key, no rate limits). Geopolitics and Sentiment next (NewsAPI — single key). Fundamentals next (SEC EDGAR — free, public). Technical and Sector last (Polygon.io — rate-limited free tier, most complex data wiring). Synthesizer waits until all 7 agents exist to avoid synthesizing partial data.

---

## Problem Statement

Managing a personal investment portfolio on the US stock market requires synthesizing a vast range of constantly-changing information — geopolitical events, macroeconomic signals, sector trends, earnings data, technical patterns, and market sentiment — that no individual investor can reasonably track in full. Without a structured way to aggregate these signals against their own portfolio and risk tolerance, investors make decisions with incomplete context, miss rebalancing opportunities, and lack a clear rationale to evaluate past choices.

## Solution

An AI-powered module within Sojourn that accepts a user's current portfolio and available cash, runs a panel of 7 specialized AI agents across distinct knowledge domains in parallel via Inngest, and synthesizes their analysis into a target allocation with an implied buy/sell action list. Each recommendation includes full per-agent reasoning so the user understands exactly why each decision was made. The module uses compressed summaries of past recommendations to inform future analysis runs.

---

## User Stories

### Portfolio Onboarding
1. As a `premium_plus` user visiting `/portfolio` for the first time, I want to see a full-screen T&C acceptance gate acknowledging this is not regulated financial advice, so that I understand the informational nature of the feature before proceeding.

### Portfolio Management
2. As a user, I want to enter my stock holdings one by one using a form with stock ticker autocomplete, so that I can quickly and accurately build my portfolio.
3. As a user, I want to enter the total dollar value of each holding (not share count), so that I don't need to look up current prices manually.
4. As a user, I want to enter the total cash amount I am willing to invest, so that the app knows my full deployable capital.
5. As a user, I want to edit or remove individual holdings, so that I can keep my portfolio accurate after trades.
6. As a user, I want to see my current portfolio summary (holdings, total value, cash), so that I have a clear picture of my position before running an analysis.

### Target & Risk Configuration
7. As a user, I want to set a target annual return percentage, so that the agents have a concrete wealth growth objective to optimize towards.
8. As a user, I want to set a risk profile (conservative / moderate / aggressive), so that the agents calibrate recommendations to my tolerance for volatility.
9. As a user, I want to update my target return and risk profile at any time, so that my preferences are always current.

### Analysis Runs
10. As a user, I want to configure a recurring analysis schedule (every 7, 14, or 30 days), so that I receive fresh recommendations automatically.
11. As a user, I want to trigger a manual analysis run at any time, so that I can react to major market events without waiting for my scheduled run.
12. As a user, I want a 24-hour cooldown enforced between manual runs, so that I don't accidentally trigger duplicate runs.
13. As a user, I want to see a progress indicator showing which agents have completed during a run, so that the wait feels purposeful and I can see the system working.
14. As a user, I want to be notified by email when my scheduled analysis completes, so that I know results are ready without having to check the app.

### Recommendations
15. As a user, I want to see a target portfolio allocation (% per stock), so that I know what my ideal portfolio composition looks like.
16. As a user, I want to see the implied buy/sell action list derived from my current portfolio vs. the target allocation, so that I know the concrete steps to rebalance.
17. As a user, I want position sizes shown as both percentage and dollar amount (calculated from my total portfolio value), so that I can act on recommendations without mental math.
18. As a user, I want to read a clear summary paragraph explaining the overall recommendation rationale, so that I can quickly understand the key drivers.
19. As a user, I want to expand a per-agent breakdown showing each agent's analysis and conclusion, so that I can audit the reasoning behind specific allocation decisions.
20. As a user, I want to see which agents disagreed and how the synthesizer resolved the conflict, so that I understand where there was uncertainty in the recommendation.
21. As a user, I want a persistent disclaimer on every recommendation page clarifying this is not regulated financial advice, so that the informational nature of the feature is always clear.

### Historical Recommendations
22. As a user, I want to browse my full history of past recommendations, so that I can see how the agents' thinking has evolved over time.

### UI & Experience
23. As a user, I want the portfolio module to work well on mobile browsers, so that I can check recommendations on my phone.

---

## Implementation Decisions

### Sojourn Integration
- `UserRole` in `src/types/database.ts` gains `'premium_plus'` as a new value alongside `'main' | 'assistant' | 'premium'`.
- All portfolio API routes guard with `role === 'premium_plus'` — no `on_behalf_of` logic, no assistant access.
- The `/agents` code pipeline demo page re-gates from `premium` to `premium_plus`.
- Middleware protects all `/portfolio/*` routes; unauthenticated users redirect to `/login`.
- T&C gate: on first visit to any `/portfolio/*` route, users without `portfolio_tos_accepted_at` on their profile row are redirected to `/portfolio` which renders a full-screen acceptance gate. On confirm, `portfolio_tos_accepted_at` is set and the user proceeds.
- Post-T&C redirect uses `window.location.href` (not `router.push`) to ensure session cookie is carried — same pattern as the existing auth flow.

### Portfolio Module
- Portfolio stored as a `portfolio_holdings` table: `user_id`, `ticker`, `total_value_usd`, `updated_at`.
- Cash and configuration stored as a single `portfolio_settings` row per user: `cash_usd`, `target_return_pct`, `risk_profile` (enum: `conservative` / `moderate` / `aggressive`), `run_interval_days` (7 / 14 / 30), `last_run_at`, `next_run_at`.
- Stock ticker autocomplete powered by Polygon.io free tier ticker search endpoint.
- Entry is manual form only — one holding at a time. No CSV import.

### Agent Module
- Fixed roster of 7 agents: **Geopolitics**, **Macroeconomics**, **Technical Analysis**, **Fundamentals/Earnings**, **Sector Analysis**, **Sentiment/News**, **Fed & Interest Rates**.
- Each agent is a prompt template + data source wiring, stored in server-side configuration (not hardcoded per-user).
- All agents use `claude-sonnet-4-6`. Model is app-controlled via a single server-side constant — no per-user model configuration.
- Agents run in parallel via Inngest fan-out. Each agent sub-job: fetch relevant data → call LLM with system prompt + data + portfolio context → return structured output (analysis text + confidence + bullish/bearish stance per sector).
- Agent outputs are structured JSON, not free text, to make synthesizer aggregation deterministic.

### Data Source Module
- All API keys are app-owned and stored in environment variables. No user-supplied keys, no per-user data source configuration.
- Pluggable connector interface: each data source implements `fetch(query: AgentDataRequest): Promise<DataPayload>`.
- Connectors: FRED (macroeconomic indicators), SEC EDGAR (earnings filings), NewsAPI (news/geopolitics/sentiment), Polygon.io free tier (market data, ticker search).
- Each agent declares which data source types it consumes; the orchestrator resolves the actual connector at run time.
- Data fetches are cached per run — fetch once per run, not per agent, to respect Polygon.io's 5 calls/minute free tier limit.

### Synthesizer Module
- Single LLM call (`claude-sonnet-4-6`) with all 7 agent outputs + portfolio + risk profile + historical summaries (up to 5 most recent) as context.
- Output: target allocation (array of `{ticker, target_pct, rationale}`) + overall summary + conflict resolution notes.
- Implied action list computed deterministically from current holdings vs. target allocation — no LLM involved.
- Position sizes in $ = `target_pct × (total_holdings_value + cash_usd)`.

### Recommendation Module
- `recommendations` table: `id`, `user_id`, `run_at`, `target_allocation` (JSONB), `action_list` (JSONB), `summary_text`, `agent_outputs` (JSONB), `portfolio_snapshot` (JSONB), `status`.
- Disclaimer text rendered from a server-side constant — never user-editable.
- No outcome tracking at launch. Performance analysis against actual market prices is deferred.

### History/Summarization Module
- After each completed run, a separate Inngest job calls `claude-haiku-4-5-20251001` with the full recommendation to generate a 200–300 token summary: what was recommended and key agent stances.
- Summaries stored in `recommendation_summaries`: `recommendation_id`, `summary_text`, `created_at`.
- Synthesizer context injection: fetch the 5 most recent summaries ordered by `run_at desc` and prepend to the synthesizer prompt. If fewer than 5 exist, all available are used without error.

### Job Orchestration Module
- Inngest handles all async work: analysis fan-out, scheduling, and summarization.
- Per-user schedule stored in `portfolio_settings`: `run_interval_days` (7 / 14 / 30), `last_run_at`, `next_run_at`.
- A global Inngest cron (daily) checks all users with `next_run_at <= now()` and enqueues their analysis.
- Manual run endpoint validates cooldown: `last_run_at + 24 hours <= now()`. Returns `429` if within cooldown.
- Run progress stored in `run_progress` table: `run_id`, `agent_name`, `status` (`pending` / `running` / `complete` / `error`), `completed_at`.
- Client polls `/api/portfolio/run/[id]/progress` every 3 seconds to update the progress UI. No Supabase Realtime subscription required.

### Notification Module
- Resend for transactional email — same setup as the existing Sojourn email module.
- Email sent by Inngest job on run completion: subject "Your Sojourn portfolio analysis is ready", body with summary excerpt and CTA link to `/portfolio/recommendations/[id]`.
- No in-app notification badge at launch.

### Schema Changes to Sojourn

New columns on existing tables:
- `user_profiles.portfolio_tos_accepted_at` (timestamptz, nullable)

New tables:
- `portfolio_holdings` (user_id, ticker, total_value_usd, updated_at)
- `portfolio_settings` (user_id, cash_usd, target_return_pct, risk_profile, run_interval_days, last_run_at, next_run_at)
- `recommendations` (id, user_id, run_at, target_allocation, action_list, summary_text, agent_outputs, portfolio_snapshot, status)
- `recommendation_summaries` (recommendation_id, summary_text, created_at)
- `run_progress` (run_id, agent_name, status, completed_at)

Tables from the original PRD that are **not** being built:
- `data_source_configs` — app-owned keys, no user configuration
- `agent_model_configs` — app-controlled model, no user configuration
- `recommendation_outcomes` — outcome tracking deferred
- `notifications` — in-app badge deferred

---

## Testing Decisions

**What makes a good test:** Tests should assert external, observable behavior — what a module returns or what side effects it produces — not how it does it internally. Avoid testing implementation details like private function calls or internal state. Tests should be runnable in isolation with controlled inputs.

### Portfolio Onboarding
- Test T&C gate: `premium_plus` users without `portfolio_tos_accepted_at` are redirected to the acceptance gate; users with it pass through.
- Test T&C acceptance sets `portfolio_tos_accepted_at` and redirects to `/portfolio`.

### Portfolio Module
- Test portfolio value calculations: total portfolio value = sum of holdings + cash.
- Test holding validation: ticker must be non-empty; `total_value_usd` must be positive.

### Agent Module
- Test agent prompt construction: given a portfolio snapshot and data payload, the prompt contains the expected context sections.
- Test structured output parsing: valid JSON from LLM is parsed correctly; malformed output surfaces a recoverable error without crashing the run.

### Data Source Module
- Test each connector with mocked HTTP responses: returns a correctly shaped `DataPayload`; handles rate limit / error responses gracefully.

### Synthesizer Module
- Test allocation output: given 7 agent outputs + portfolio, synthesizer prompt contains all agent stances; output parses to a valid `{ticker, target_pct, rationale}[]` array summing to 100%.
- Test implied action list: given current holdings and target allocation, action list correctly identifies buys, sells, and holds with correct $ amounts.
- Test context injection: the 5 most recent summaries are prepended; if fewer than 5 exist, all available are used without error.

### Recommendation Module
- Test position sizing: `target_pct × total_value` produces correct dollar amounts; rounding is consistent.

### History/Summarization Module
- Test summary generation: output is under 350 tokens; contains recommendation date and key agent stances.
- Test context injection limit: only the 5 most recent summaries are injected regardless of how many exist.

### Job Orchestration Module
- Test scheduling logic: users with `next_run_at <= now()` are enqueued; users with future `next_run_at` are skipped.
- Test cooldown enforcement: manual run endpoint returns 429 if `last_run_at + 24 hours > now()`.
- Test fan-out: analysis job spawns exactly 7 agent sub-jobs; synthesizer job is enqueued only after all 7 complete.

### Notification Module
- Test email trigger: Resend is called with correct recipient and recommendation link on run completion.

---

## Out of Scope

- Brokerage API integration (Plaid, Alpaca, Schwab) — portfolio is manual-entry only at launch.
- Options, futures, crypto, ETFs, or non-US markets — US stocks only.
- Direct trade execution — the module is advisory only.
- Mobile native apps (iOS/Android) — web responsive only.
- User-configurable agent roster — the 7-agent set is fixed at launch.
- SEC registration or regulated investment advisor status.
- Real-time intraday alerts or streaming price data.
- Social features (sharing recommendations, following other users).
- CSV portfolio import — manual form entry only at launch.
- Dark mode — whole-app concern, separate story.
- Outcome tracking / recommendation performance analysis — deferred until sufficient recommendation history exists.
- User-configurable data sources or API keys — app-owned keys only.
- Per-user AI model configuration — app-controlled model only.
- In-app notification badge — email notification only at launch.
- Portfolio visibility for assistant users — owner-only access.
- Agent-to-agent back-and-forth debate — parallel analysis with synthesizer only.

---

## Further Notes

- **Token budget discipline:** Agent prompts must include a token budget directive. Each agent output should target 400–600 tokens. Synthesizer input (7 agents + portfolio + 5 summaries) should be budgeted to stay under 12,000 tokens to leave room for the synthesis output.
- **Polygon.io free tier limits:** 5 API calls/minute. Agent data fetches must be rate-limited and cached per run — fetch once per run, not per agent.
- **investing.com:** Dropped. investing.com has no official public API and scraping is unreliable. Polygon.io free tier covers the same technical/fundamentals data needs.
- **Tech stack:** This module is built within the Sojourn stack — Next.js App Router, TypeScript strict, Supabase, Tailwind v4, Vitest, Inngest, Resend, Zod. All existing patterns (Supabase client/server/admin, `logAudit`, `getUser`, Toast, Skeleton) apply.
