# Plan — Alpaca Portfolio Sync (017)

## Architecture

### Data Flow
```
Portfolio Page (server component)
  → check alpaca_credentials
  → if connected: syncAlpacaPositions() [lib fn]
      → GET /v2/positions (Alpaca)
      → upsert portfolio_holdings (admin client)
      → update portfolio_settings.last_synced_at
  → re-query portfolio_holdings from DB
  → render PortfolioOverview with fresh data + syncMeta
```

### Sync Logic (reconciliation)
```
Alpaca positions   DB holdings       Action
────────────────────────────────────────────────────
exists             exists            UPDATE total_value_usd, qty, updated_at
exists             missing           INSERT (lookup company name first)
missing            exists            LEAVE UNTOUCHED
```

### Company Name Lookup (for new tickers from Alpaca)
Re-use the existing ticker search infrastructure. Look at how the portfolio holdings form resolves company names and call the same endpoint or lib function server-side.

## New Files
- `supabase/migrations/20260620_alpaca_portfolio_sync.sql`
- `src/lib/alpacaPortfolioSync.ts`
- `src/app/api/portfolio/alpaca/sync/route.ts`

## Modified Files
- `src/types/database.ts` — add `qty`, `last_synced_at` fields
- `src/app/portfolio/page.tsx` — trigger sync, pass meta props
- `src/components/portfolio/PortfolioOverview.tsx` — Shares column, sync status, error banner

## Key Decisions (from design session)
- Page-load sync is the primary mechanism (handles market-closed case: orders fill overnight, user sees fresh data on next visit)
- Manual sync button always visible when Alpaca connected (not just on error)
- Last-synced timestamp stored in `portfolio_settings` (one row per user, already exists)
- `qty` nullable so manual holdings aren't broken
- Silent skip when no credentials; amber banner + retry when credentials exist but sync fails
