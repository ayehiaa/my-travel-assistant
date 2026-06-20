-- 20260620_alpaca_portfolio_sync.sql

-- Add qty column to portfolio_holdings (nullable — manual holdings have no qty)
ALTER TABLE public.portfolio_holdings
  ADD COLUMN IF NOT EXISTS qty numeric(12,6) NULL;

-- Add last_synced_at column to portfolio_settings (nullable — unsynced users have NULL)
ALTER TABLE public.portfolio_settings
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL;
