-- Create user_profiles for per-user preference and consent storage
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id                   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_tos_accepted_at timestamptz NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own row (TOS accept creates the row on first visit)
CREATE POLICY "user_profiles_insert_own"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own row
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
