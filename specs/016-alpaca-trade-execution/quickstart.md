# Quickstart: Alpaca Trade Execution

## Prerequisites

1. Alpaca paper trading account — sign up at https://app.alpaca.markets
2. Generate paper trading API keys in the Alpaca dashboard (API Keys section)
3. `ALPACA_CREDENTIAL_ENCRYPTION_KEY` env var — generate with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Add to `.env.local` as `ALPACA_CREDENTIAL_ENCRYPTION_KEY=<output>`

## DB Migration

Run in Supabase SQL editor (or via CLI):
```
supabase/migrations/20260619_alpaca_trade_execution.sql
```

## Testing the Flow

1. Log in as a `premium_plus` user
2. Visit `/portfolio/settings` → scroll to "Alpaca Connection" card
3. Paste your paper trading Key ID and Secret Key, toggle "Paper Trading" on, click Connect
4. Run a portfolio analysis at `/portfolio/run` (or use an existing completed recommendation)
5. Visit the most recent recommendation at `/portfolio/recommendations/[id]`
6. Click "Execute trades (PAPER)" → review the preview table → confirm
7. Verify the results panel appears with order statuses
8. Confirm the execute button is now replaced by "Executed on [date]"
9. Reload the page — results panel persists

## Env Vars Added

| Variable | Purpose |
|---|---|
| `ALPACA_CREDENTIAL_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM encryption of Alpaca API credentials |
