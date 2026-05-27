-- portfolio_holdings: one row per stock holding per user
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           text           NOT NULL CHECK (ticker ~ '^[A-Za-z0-9.]{1,10}$'),
  company_name     text           NOT NULL,
  total_value_usd  numeric(12,2)  NOT NULL CHECK (total_value_usd > 0),
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings_select_own"
  ON public.portfolio_holdings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "holdings_insert_own"
  ON public.portfolio_holdings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "holdings_update_own"
  ON public.portfolio_holdings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "holdings_delete_own"
  ON public.portfolio_holdings FOR DELETE
  USING (user_id = auth.uid());

-- portfolio_settings: one row per user — config + scheduling state
CREATE TABLE IF NOT EXISTS public.portfolio_settings (
  user_id              uuid           PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_usd             numeric(12,2)  NOT NULL DEFAULT 0 CHECK (cash_usd >= 0),
  target_return_pct    numeric(5,2)   NOT NULL DEFAULT 10 CHECK (target_return_pct > 0),
  risk_profile         text           NOT NULL DEFAULT 'moderate'
    CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
  run_interval_days    integer        NOT NULL DEFAULT 30
    CHECK (run_interval_days IN (7, 14, 30)),
  last_run_at          timestamptz    NULL,
  next_run_at          timestamptz    NULL,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_own"
  ON public.portfolio_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "settings_insert_own"
  ON public.portfolio_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_update_own"
  ON public.portfolio_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
