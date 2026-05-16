-- Migration: 007_delete_user_function
-- Creates an admin-only function to fully delete a user and all their data.
--
-- Usage (Supabase SQL Editor):
--   SELECT delete_user('USER_UUID_HERE');

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as the function owner (postgres), bypassing RLS
AS $$
DECLARE
  user_role     text;
  trips_deleted int;
  audit_deleted int;
BEGIN

  -- Abort if user does not exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'User % not found in auth.users', target_user_id;
  END IF;

  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = target_user_id;

  RAISE NOTICE 'Deleting user % (role: %)', target_user_id, COALESCE(user_role, 'no role');

  -- Step 1: Nullify audit_log.on_behalf_of (nullable column)
  UPDATE public.audit_log
  SET on_behalf_of = NULL
  WHERE on_behalf_of = target_user_id;

  -- Step 2: Delete audit_log rows performed by this user
  -- (performed_by is NOT NULL with no cascade — must be removed first)
  DELETE FROM public.audit_log
  WHERE performed_by = target_user_id;

  GET DIAGNOSTICS audit_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % audit_log rows', audit_deleted;

  -- Step 3: Reassign trip attribution for trips this user acted on
  -- as an assistant (owned by another account — preserve that data)
  UPDATE public.trips
  SET created_by = owner_id
  WHERE created_by = target_user_id
    AND owner_id <> target_user_id;

  UPDATE public.trips
  SET last_modified_by = owner_id
  WHERE last_modified_by = target_user_id
    AND owner_id <> target_user_id;

  -- Step 4: Delete all trips owned by this user
  -- (trip_legs cascade automatically via ON DELETE CASCADE)
  DELETE FROM public.trips
  WHERE owner_id = target_user_id;

  GET DIAGNOSTICS trips_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % trips (and their legs)', trips_deleted;

  -- Step 5: Reassign account_links.created_by where this user is the
  -- creator but not a participant (satisfies the NOT NULL constraint)
  UPDATE public.account_links
  SET created_by = main_user_id
  WHERE created_by = target_user_id
    AND main_user_id <> target_user_id
    AND assistant_user_id <> target_user_id;

  -- Step 6: Delete account_links where this user is main or assistant
  DELETE FROM public.account_links
  WHERE main_user_id = target_user_id
     OR assistant_user_id = target_user_id;

  -- Step 7: Delete user_roles row
  DELETE FROM public.user_roles
  WHERE user_id = target_user_id;

  -- Step 8: Delete the auth user — triggers remaining ON DELETE CASCADE chains
  DELETE FROM auth.users
  WHERE id = target_user_id;

  RAISE NOTICE 'User % deleted successfully.', target_user_id;

END $$;

-- Restrict execution to the postgres role (Supabase service role)
-- Prevents authenticated users from calling this directly
REVOKE ALL ON FUNCTION public.delete_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user(uuid) FROM authenticated;
