-- ============================================================
-- Invitation flow — add status tracking to account_links
-- ============================================================

ALTER TABLE public.account_links
  ADD COLUMN status varchar(10) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'expired')),
  ADD COLUMN invited_at  timestamptz,
  ADD COLUMN expires_at  timestamptz;

-- Index for fast expiry and status lookups per assistant
CREATE INDEX account_links_status_idx
  ON public.account_links (assistant_user_id, status);
