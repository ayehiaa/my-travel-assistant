# Quickstart: Portfolio Advisor Module

## Prerequisites

1. Existing Sojourn dev environment running (`npm run dev`)
2. Supabase project with existing schema
3. Inngest account (free tier sufficient for dev)

## New Environment Variables

Add to `.env.local`:
```bash
# Inngest
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key

# Data Sources
POLYGON_API_KEY=your-polygon-api-key          # polygon.io free tier
FRED_API_KEY=your-fred-api-key                # fred.stlouisfed.org (free)
NEWS_API_KEY=your-newsapi-key                 # newsapi.org free tier
# SEC EDGAR: no API key required
```

## Install Inngest

```bash
npm install inngest
```

## Database Migrations

Run in order against your Supabase project:

```sql
-- 1. Add premium_plus role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'premium_plus';

-- 2. Create user_profiles (or add column if table exists)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_tos_accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS portfolio_tos_accepted_at timestamptz NULL;

-- 3. Portfolio tables (see data-model.md for full DDL)
-- portfolio_holdings
-- portfolio_settings
-- run_progress
-- recommendations
-- recommendation_summaries
```

## Local Inngest Dev Server

In a separate terminal:
```bash
npx inngest-cli@latest dev
```
This proxies events to your local Next.js app at `http://localhost:3000/api/inngest`.

## Testing a Manual Run

1. Upgrade a user to `premium_plus` in Supabase dashboard (update `user_roles.role`)
2. Visit `http://localhost:3000/portfolio` — accept the T&C gate
3. Add 2–3 holdings via the form
4. Set cash, risk profile, and target return in Settings
5. Go to `/portfolio/run` → click "Run Analysis"
6. Watch agent progress polling update every 3 seconds
7. On completion, visit `/portfolio/recommendations/[id]`

## Running Tests

```bash
npm test
```

Pure function tests cover:
- `portfolioCalculator.ts` — action list computation, position sizing
- `synthesizer.ts` (prompt construction) — context injection, token budget
