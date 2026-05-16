-- Migration: 008_customer_invitations
-- Adds 'premium' role and customer_invitations table for invitation-only sign-up.

-- 1. Expand role check constraint to include 'premium'
ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('main', 'assistant', 'premium'));

-- 2. Create customer_invitations table
CREATE TABLE public.customer_invitations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  invited_name text        NOT NULL,
  token        uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status       varchar(10) NOT NULL
                 CHECK (status IN ('pending', 'accepted', 'expired'))
                 DEFAULT 'pending',
  invited_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

ALTER TABLE public.customer_invitations ENABLE ROW LEVEL SECURITY;

-- Premium accounts can read their own rows
CREATE POLICY "premium_select_own_invitations"
  ON public.customer_invitations
  FOR SELECT
  USING (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'premium'
    )
  );

-- Premium accounts can insert their own rows
CREATE POLICY "premium_insert_own_invitations"
  ON public.customer_invitations
  FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'premium'
    )
  );
