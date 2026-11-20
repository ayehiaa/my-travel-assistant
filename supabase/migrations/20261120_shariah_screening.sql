-- 20261120_shariah_screening.sql
-- Stores the full Shariah screening result (per-ticker verdict, reasons, ratios, source,
-- excluded flag, screened_at) on each recommendation.
-- Safe to apply at any time: the app writes this column in a separate best-effort update and
-- falls back to agent_outputs.shariah_review when the column is absent or empty.
-- RLS: recommendations already has row-level policies scoped to user_id; a new column inherits them.

ALTER TABLE public.recommendations
  ADD COLUMN IF NOT EXISTS shariah_screening jsonb NULL;

COMMENT ON COLUMN public.recommendations.shariah_screening IS
  'Shariah screening result (version 1): per-ticker verdicts, AAOIFI ratios with source, excluded tickers. See specs/019-shariah-screening.';
