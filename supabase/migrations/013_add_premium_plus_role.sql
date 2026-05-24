-- Add 'premium_plus' to the user_roles role constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('main', 'assistant', 'premium', 'premium_plus'));
