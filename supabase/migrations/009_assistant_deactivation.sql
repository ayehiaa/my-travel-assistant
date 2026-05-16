ALTER TABLE public.user_roles
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'deactivated'));
