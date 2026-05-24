# Data Model: Portfolio Advisor Module

## Existing Table Changes

### `user_roles` (existing)
Add `'premium_plus'` to the `role` enum.
```sql
ALTER TYPE user_role ADD VALUE 'premium_plus';
```
TypeScript: `UserRole = 'main' | 'assistant' | 'premium' | 'premium_plus'`

### `user_profiles` (existing, if present — otherwise create)
Add `portfolio_tos_accepted_at` column:
```sql
ALTER TABLE user_profiles ADD COLUMN portfolio_tos_accepted_at timestamptz NULL;
```
If `user_profiles` does not exist yet, create it:
```sql
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_tos_accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
RLS: Users can read/update only their own row.

---

## New Tables

### `portfolio_holdings`
One row per stock holding per user.

```sql
CREATE TABLE portfolio_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  company_name text NOT NULL,
  total_value_usd numeric(12,2) NOT NULL CHECK (total_value_usd > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);
```
RLS: Users can CRUD only their own holdings.

### `portfolio_settings`
One row per user — configuration + scheduling state.

```sql
CREATE TABLE portfolio_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_usd >= 0),
  target_return_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (target_return_pct > 0),
  risk_profile text NOT NULL DEFAULT 'moderate'
    CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
  run_interval_days integer NOT NULL DEFAULT 30
    CHECK (run_interval_days IN (7, 14, 30)),
  last_run_at timestamptz NULL,
  next_run_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
RLS: Users can read/update only their own row.

### `run_progress`
One row per agent per analysis run. Written by Inngest, polled by client.

```sql
CREATE TABLE run_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  agent_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'complete', 'error')),
  error_message text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, agent_name)
);
```
RLS: Users can read progress rows where `run_id` matches one of their recommendations.

**Agent names** (exactly 7): `macroeconomics`, `fed_rates`, `geopolitics`, `sentiment`, `fundamentals`, `technical_analysis`, `sector_analysis`

### `recommendations`
One row per completed (or in-progress) analysis run.

```sql
CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'error')),
  target_allocation jsonb NULL,   -- [{ticker, target_pct, rationale}]
  action_list jsonb NULL,         -- [{ticker, action, current_pct, target_pct, current_usd, target_usd, delta_usd}]
  summary_text text NULL,
  conflict_notes text NULL,
  agent_outputs jsonb NULL,       -- {agent_name: {analysis, confidence, stance}}
  portfolio_snapshot jsonb NULL,  -- {holdings: [{ticker, total_value_usd}], cash_usd, total_value_usd}
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recommendations_user_id_run_at ON recommendations(user_id, run_at DESC);
```
RLS: Users can read only their own recommendations.

### `recommendation_summaries`
One row per completed recommendation — compressed context for future runs.

```sql
CREATE TABLE recommendation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
RLS: Users can read only summaries linked to their own recommendations (join via `recommendations`).

---

## TypeScript Interfaces

```ts
// Additions to src/types/database.ts

export type UserRole = 'main' | 'assistant' | 'premium' | 'premium_plus'

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'
export type RunStatus = 'running' | 'complete' | 'error'
export type AgentStatus = 'pending' | 'running' | 'complete' | 'error'

export interface PortfolioHolding {
  id: string
  user_id: string
  ticker: string
  company_name: string
  total_value_usd: number
  created_at: string
  updated_at: string
}

export interface PortfolioSettings {
  user_id: string
  cash_usd: number
  target_return_pct: number
  risk_profile: RiskProfile
  run_interval_days: 7 | 14 | 30
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export interface RunProgress {
  id: string
  run_id: string
  agent_name: string
  status: AgentStatus
  error_message: string | null
  completed_at: string | null
  created_at: string
}

export interface TargetAllocationItem {
  ticker: string
  target_pct: number
  rationale: string
}

export interface ActionItem {
  ticker: string
  action: 'buy' | 'sell' | 'hold'
  current_pct: number
  target_pct: number
  current_usd: number
  target_usd: number
  delta_usd: number
}

export interface AgentOutput {
  analysis: string
  confidence: 'low' | 'medium' | 'high'
  stance: 'bullish' | 'bearish' | 'neutral'
}

export interface PortfolioSnapshot {
  holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>
  cash_usd: number
  total_value_usd: number
}

export interface Recommendation {
  id: string
  user_id: string
  run_at: string
  status: RunStatus
  target_allocation: TargetAllocationItem[] | null
  action_list: ActionItem[] | null
  summary_text: string | null
  conflict_notes: string | null
  agent_outputs: Record<string, AgentOutput> | null
  portfolio_snapshot: PortfolioSnapshot | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface RecommendationSummary {
  id: string
  recommendation_id: string
  summary_text: string
  created_at: string
}
```

---

## JSONB Shape Reference

### `target_allocation`
```json
[
  { "ticker": "AAPL", "target_pct": 15.5, "rationale": "Strong fundamentals, low macro risk..." },
  { "ticker": "MSFT", "target_pct": 12.0, "rationale": "..." }
]
```
Invariant: sum of `target_pct` across all items = 100.

### `action_list`
```json
[
  { "ticker": "AAPL", "action": "buy",  "current_pct": 10.0, "target_pct": 15.5, "current_usd": 5000, "target_usd": 7750, "delta_usd": 2750 },
  { "ticker": "TSLA", "action": "sell", "current_pct": 20.0, "target_pct": 5.0,  "current_usd": 10000, "target_usd": 2500, "delta_usd": -7500 }
]
```

### `agent_outputs`
```json
{
  "macroeconomics": { "analysis": "GDP growth slowing...", "confidence": "high", "stance": "bearish" },
  "fed_rates": { "analysis": "Fed likely to hold...", "confidence": "medium", "stance": "neutral" }
}
```
