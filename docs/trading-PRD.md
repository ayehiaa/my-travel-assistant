# PRD: AI-Powered Trading Advisor

## Problem Statement

Managing a personal investment portfolio on the US stock market requires synthesizing a vast range of constantly-changing information — geopolitical events, macroeconomic signals, sector trends, earnings data, technical patterns, and market sentiment — that no individual investor can reasonably track in full. Without a structured way to aggregate these signals against their own portfolio and risk tolerance, investors make decisions with incomplete context, miss rebalancing opportunities, and lack a clear rationale to evaluate past choices.

## Solution

An AI-powered multi-user web application that accepts a user's current portfolio and available cash, runs a panel of specialized AI agents across distinct knowledge domains in parallel, and synthesizes their analysis into a monthly target allocation with an implied buy/sell action list. Each recommendation includes full per-agent reasoning so the user understands exactly why each decision was made. The app tracks historical recommendations and actual market outcomes so users can evaluate agent quality over time, and uses compressed summaries of that history to inform future recommendations.

## User Stories

### Onboarding & Auth
1. As a new user, I want to sign up with my email and password, so that I can access the app securely.
2. As a new user, I want to accept Terms of Service on signup acknowledging this is not regulated financial advice, so that I understand the informational nature of the app.
3. As a returning user, I want to log in with my email and password, so that I can access my portfolio and recommendations.
4. As a user, I want to reset my password via email, so that I can recover access if I forget it.

### Portfolio Management
5. As a user, I want to enter my stock holdings one by one using a form with stock ticker autocomplete, so that I can quickly and accurately build my portfolio.
6. As a user, I want to import my portfolio via CSV upload, so that I can bulk-enter my holdings without manual form entry.
7. As a user, I want to enter the total dollar value of each holding (not share count), so that I don't need to look up current prices manually.
8. As a user, I want to enter the total cash amount I am willing to invest, so that the app knows my full deployable capital.
9. As a user, I want to edit or remove individual holdings, so that I can keep my portfolio accurate after trades.
10. As a user, I want to see my current portfolio summary (holdings, total value, cash), so that I have a clear picture of my position before running an analysis.

### Target & Risk Configuration
11. As a user, I want to set a target annual return percentage, so that the agents have a concrete wealth growth objective to optimize towards.
12. As a user, I want to set a risk profile (conservative / moderate / aggressive), so that the agents calibrate recommendations to my tolerance for volatility.
13. As a user, I want to update my target return and risk profile at any time, so that my preferences are always current.

### Analysis Runs
14. As a user, I want to configure a recurring analysis schedule (every 3, 7, 14, or 30 days), so that I receive fresh recommendations automatically.
15. As a user, I want to trigger a manual analysis run at any time, so that I can react to major market events without waiting for my scheduled run.
16. As a user, I want a cooldown enforced between manual runs, so that I don't accidentally burn through API costs by re-running repeatedly.
17. As a user, I want to see a real-time progress indicator showing which agents have completed during a run, so that the wait feels purposeful and I can see the system working.
18. As a user, I want to be notified by email when my scheduled analysis completes, so that I know results are ready without having to check the app.
19. As a user, I want to see an in-app notification badge when a new recommendation is ready, so that I'm informed when I next open the app.

### Recommendations
20. As a user, I want to see a target portfolio allocation (% per stock), so that I know what my ideal portfolio composition looks like.
21. As a user, I want to see the implied buy/sell action list derived from my current portfolio vs. the target allocation, so that I know the concrete steps to rebalance.
22. As a user, I want position sizes shown as both percentage and dollar amount (calculated from my total portfolio value), so that I can act on recommendations without mental math.
23. As a user, I want to read a clear summary paragraph explaining the overall recommendation rationale, so that I can quickly understand the key drivers.
24. As a user, I want to expand a per-agent breakdown showing each agent's analysis and conclusion, so that I can audit the reasoning behind specific allocation decisions.
25. As a user, I want to see which agents disagreed and how the synthesizer resolved the conflict, so that I understand where there was uncertainty in the recommendation.
26. As a user, I want a persistent disclaimer on every recommendation page clarifying this is not regulated financial advice, so that the informational nature of the app is always clear.

### Historical Recommendations & Outcomes
27. As a user, I want to browse my full history of past recommendations, so that I can see how the agents' thinking has evolved over time.
28. As a user, I want to see the actual market performance of recommended stocks after a recommendation was made, so that I can evaluate how accurate each call was.
29. As a user, I want to see a summary of how my portfolio would have performed if I had followed past recommendations, so that I can assess overall agent quality.

### Data Sources
30. As a user, I want the app to include a default set of free data sources (FRED, SEC EDGAR, NewsAPI, Polygon.io free tier, investing.com), so that agents have real information without requiring me to set anything up.
31. As a user, I want to add additional data sources (free or paid subscription) from a settings panel, so that I can enhance agent quality with premium data as I choose.
32. As a user, I want to see which data sources each agent is using in its analysis, so that I understand where the information comes from.

### Model Configuration
33. As a user, I want to see which AI model is currently assigned to each agent, so that I understand the system's composition.
34. As a user, I want to change the AI model used for each agent from a settings panel, so that I can experiment with different models for different domains.
35. As a user, I want to see a recommended model for each agent domain based on independent benchmarking, so that I have an informed starting point when configuring models.
36. As a user, I want the app to default to claude-sonnet-4-6 for all agents, so that I have a working system out of the box.

### UI & Experience
37. As a user, I want a clean, card-based dashboard as my home screen, so that key information is immediately visible without feeling overwhelming.
38. As a user, I want to toggle between light and dark mode, so that I can use the app comfortably in any environment.
39. As a user, I want the app to work well on mobile browsers, so that I can check recommendations on my phone.

---

## Implementation Decisions

### Auth Module
- Supabase email/password authentication, matching the pattern from the travel-assistant project.
- T&C acceptance stored as a boolean + timestamp on the user's profile row at signup.
- Users without a confirmed T&C acceptance are redirected to an acceptance gate before accessing any app content.
- Post-login redirect must use `window.location.href = '/'` (not router.push) to ensure the Supabase session cookie is correctly carried — same critical pattern as travel-assistant.

### Portfolio Module
- Portfolio stored as a `holdings` table: `user_id`, `ticker`, `total_value_usd`, `updated_at`.
- Cash stored as a single `portfolio_settings` row per user: `cash_usd`, `target_return_pct`, `risk_profile` (enum: conservative/moderate/aggressive).
- Stock ticker autocomplete powered by Polygon.io free tier ticker search endpoint.
- CSV import: parse client-side, validate tickers against Polygon autocomplete, present preview before committing.

### Agent Module
- Fixed roster of 7 agents: **Geopolitics**, **Macroeconomics**, **Technical Analysis**, **Fundamentals/Earnings**, **Sector Analysis**, **Sentiment/News**, **Fed & Interest Rates**.
- Each agent is a prompt template + data source wiring + model assignment, stored in configuration (not hardcoded).
- Agents run in parallel via Inngest fan-out. Each agent sub-job: fetch relevant data → call LLM with system prompt + data + portfolio context → return structured output (analysis text + confidence + bullish/bearish stance per sector).
- Agent outputs are structured JSON, not free text, to make synthesizer aggregation deterministic.

### Data Source Module
- Pluggable connector interface: each data source implements `fetch(query: AgentDataRequest): Promise<DataPayload>`.
- Default connectors: FRED (macroeconomic indicators), SEC EDGAR (earnings filings), NewsAPI free tier (news/geopolitics/sentiment), Polygon.io free tier (market data, ticker search), investing.com (technical/fundamentals via scraping or public endpoints).
- User-configurable data sources stored in `data_source_configs` table: `user_id`, `source_type`, `api_key` (encrypted at rest), `enabled`.
- Each agent declares which data source types it consumes; the orchestrator resolves the actual connector at run time.

### Synthesizer Module
- Single LLM call (claude-sonnet-4-6 by default) with all 7 agent outputs + portfolio + risk profile + historical summaries (last 3–6 compressed summaries) as context.
- Output: target allocation (array of `{ticker, target_pct, rationale}`) + overall summary + conflict resolution notes.
- Implied action list computed deterministically from current holdings vs. target allocation — no LLM involved.
- Position sizes in $ = `target_pct × (total_holdings_value + cash_usd)`.

### Recommendation Module
- `recommendations` table: `id`, `user_id`, `run_at`, `target_allocation` (JSONB), `action_list` (JSONB), `summary_text`, `agent_outputs` (JSONB), `portfolio_snapshot` (JSONB), `status`.
- Outcome tracking: a scheduled job (Inngest cron) runs 30 days after each recommendation and fetches actual prices from Polygon.io to compute realised vs. recommended performance. Stored in `recommendation_outcomes`.
- Disclaimer text rendered from a server-side constant — never user-editable.

### History/Summarization Module
- After each completed run, a separate Inngest job calls a cheap LLM with the full recommendation to generate a 200–300 token summary: what was recommended, key agent stances, and (once outcomes are known) what actually happened.
- Summaries stored in `recommendation_summaries`: `recommendation_id`, `summary_text`, `created_at`.
- Synthesizer context injection: fetch the 5 most recent summaries ordered by `run_at desc` and prepend to the synthesizer prompt.

### Job Orchestration Module
- Inngest handles all async work: analysis fan-out, scheduling, outcome tracking, summarization.
- Per-user schedule stored in `portfolio_settings`: `run_interval_days` (3/7/14/30), `last_run_at`, `next_run_at`.
- A global Inngest cron (daily) checks all users with `next_run_at <= now()` and enqueues their analysis.
- Manual run endpoint validates cooldown: `last_run_at + 3 days <= now()`.
- Supabase Realtime channel per run (`run:{run_id}`) broadcasts agent completion events. Client subscribes on run start and updates progress UI.
- Run progress stored in `run_progress` table: `run_id`, `agent_name`, `status` (pending/running/complete/error), `completed_at`.

### Notification Module
- Resend for transactional email, same setup as travel-assistant.
- Email sent by Inngest job on run completion: subject "Your portfolio analysis is ready", body with summary excerpt and CTA link.
- In-app badge: `notifications` table with `user_id`, `type`, `read`, `created_at`. Badge count = `count where read = false`.

### Model Configuration Module
- `agent_model_configs` table: `user_id`, `agent_name`, `model_id`, `updated_at`.
- Default model (claude-sonnet-4-6) seeded for all agents on user creation.
- Benchmarked model recommendations stored as static configuration in the app (updated manually as new benchmarks emerge) — shown as "Recommended" badges in the settings UI.
- Model list fetched from a static config file, not from provider APIs, to avoid coupling.

### Schema Summary
- `users` (Supabase Auth) + `user_profiles` (tos_accepted_at, display_name)
- `portfolio_holdings` (user_id, ticker, total_value_usd)
- `portfolio_settings` (user_id, cash_usd, target_return_pct, risk_profile, run_interval_days, last_run_at, next_run_at)
- `data_source_configs` (user_id, source_type, api_key_encrypted, enabled)
- `agent_model_configs` (user_id, agent_name, model_id)
- `recommendations` (id, user_id, run_at, target_allocation, action_list, summary_text, agent_outputs, portfolio_snapshot, status)
- `recommendation_outcomes` (recommendation_id, evaluated_at, realised_performance_pct, detail_json)
- `recommendation_summaries` (recommendation_id, summary_text, created_at)
- `run_progress` (run_id, agent_name, status, completed_at)
- `notifications` (user_id, type, payload_json, read, created_at)

---

## Testing Decisions

**What makes a good test:** Tests should assert external, observable behavior — what a module returns or what side effects it produces — not how it does it internally. Avoid testing implementation details like private function calls or internal state. Tests should be runnable in isolation with controlled inputs.

### Auth Module
- Test T&C gate: unauthenticated users and users without `tos_accepted_at` are redirected; accepted users pass through.
- Test signup creates a `user_profiles` row and seeds default `agent_model_configs`.

### Portfolio Module
- Test CSV parser: valid CSV produces correct holdings array; invalid tickers surface as validation errors; malformed CSV returns a user-friendly error.
- Test portfolio value calculations: total portfolio value = sum of holdings + cash.

### Agent Module
- Test agent prompt construction: given a portfolio snapshot and data payload, the prompt contains the expected context sections.
- Test structured output parsing: valid JSON from LLM is parsed correctly; malformed output surfaces a recoverable error without crashing the run.

### Data Source Module
- Test each connector with mocked HTTP responses: returns a correctly shaped `DataPayload`; handles rate limit / error responses gracefully.
- Test connector resolution: the orchestrator maps agent data source declarations to the correct enabled connectors for a user.

### Synthesizer Module
- Test allocation output: given 7 agent outputs + portfolio, synthesizer prompt contains all agent stances; output parses to a valid `{ticker, target_pct, rationale}[]` array summing to 100%.
- Test implied action list: given current holdings and target allocation, action list correctly identifies buys, sells, and holds with correct $ amounts.
- Test context injection: the 5 most recent summaries are prepended; if fewer than 5 exist, all available are used without error.

### Recommendation Module
- Test position sizing: `target_pct × total_value` produces correct dollar amounts; rounding is consistent.
- Test outcome tracking job: given mock Polygon price data 30 days post-recommendation, realised performance is calculated correctly and stored.

### History/Summarization Module
- Test summary generation: output is under 350 tokens; contains recommendation date, key stances, and outcome if available.
- Test context injection limit: only the 5 most recent summaries are injected regardless of how many exist.

### Job Orchestration Module
- Test scheduling logic: users with `next_run_at <= now()` are enqueued; users with future `next_run_at` are skipped.
- Test cooldown enforcement: manual run endpoint returns 429 if `last_run_at + 3 days > now()`.
- Test fan-out: analysis job spawns exactly 7 agent sub-jobs; synthesizer job is enqueued only after all 7 complete.
- Test Realtime progress: each agent completion event updates `run_progress` and can be observed via Supabase subscription.

### Notification Module
- Test email trigger: Resend is called with correct recipient and recommendation link on run completion.
- Test badge count: `notifications` query returns correct unread count; marking as read decrements count.

---

## Out of Scope

- Brokerage API integration (Plaid, Alpaca, Schwab) — portfolio is manual-entry only at launch.
- Options, futures, crypto, ETFs, or non-US markets.
- Direct trade execution — the app is advisory only.
- Mobile native apps (iOS/Android) — web responsive only.
- User-configurable agent roster — the 7-agent set is fixed at launch.
- SEC registration or regulated investment advisor status.
- Real-time intraday alerts or streaming price data.
- Social features (sharing recommendations, following other users).
- Admin dashboard for user management — can be added once multi-user base grows.
- Agent-to-agent back-and-forth debate — parallel analysis with synthesizer only.

---

## Further Notes

- **Investing.com integration:** investing.com does not offer an official public API. The Technical Analysis and Fundamentals agents should use it as a reference source via structured scraping or a third-party wrapper. This should be re-evaluated at build time — if scraping proves unreliable, Polygon.io free tier covers the same data needs.
- **Model benchmarking:** The recommended model per agent should reference a curated external benchmark (e.g. HELMET, FinBen, or similar finance-domain LLM evaluations). This is a static config that should be reviewed and updated every 3–6 months as new models are released.
- **Token budget discipline:** Agent prompts must include a token budget directive. Each agent output should target 400–600 tokens. Synthesizer input (7 agents + portfolio + 5 summaries) should be budgeted to stay under 12,000 tokens to leave room for the synthesis output.
- **Polygon.io free tier limits:** 5 API calls/minute. Agent data fetches must be rate-limited and cached per run — fetch once per run, not per agent.
- **Supabase Realtime channel cleanup:** Run progress channels should be unsubscribed client-side on run completion or navigation away to avoid connection leaks.
- **Tech stack continuity:** This project intentionally mirrors the my-travel-assistant stack (Next.js App Router, TypeScript, Supabase, Tailwind, Vitest, Resend) to minimise context-switching and reuse established patterns (auth flow, Resend email setup, Supabase client patterns).
