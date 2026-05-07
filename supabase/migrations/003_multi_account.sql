-- ============================================================
-- My Travel Assistant — Multi-Account Schema
-- ============================================================

-- Step 1: Rename 'owner' role to 'main'
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_role_check;
UPDATE public.user_roles SET role = 'main' WHERE role = 'owner';
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('main', 'assistant'));

-- Step 2: Add owner_id to trips (add nullable, backfill, constrain)
ALTER TABLE public.trips
  ADD COLUMN owner_id uuid REFERENCES auth.users(id);

UPDATE public.trips SET owner_id = created_by;

ALTER TABLE public.trips
  ALTER COLUMN owner_id SET NOT NULL;

-- Step 3: account_links — many-to-many between main and assistant accounts
CREATE TABLE public.account_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  main_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by        uuid        NOT NULL REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (main_user_id, assistant_user_id)
);

ALTER TABLE public.account_links ENABLE ROW LEVEL SECURITY;

-- Index so the RLS subquery on trips is fast for assistant access
CREATE INDEX account_links_assistant_idx
  ON public.account_links (assistant_user_id, main_user_id);

-- Step 4: Add on_behalf_of to audit_log (null = main acted directly)
ALTER TABLE public.audit_log
  ADD COLUMN on_behalf_of uuid REFERENCES auth.users(id);

-- Step 5: Drop all existing trip RLS policies
DROP POLICY "authenticated users can read trips"   ON public.trips;
DROP POLICY "authenticated users can insert trips" ON public.trips;
DROP POLICY "authenticated users can update trips" ON public.trips;
DROP POLICY "owner can delete trips"               ON public.trips;

-- Step 6: New scoped trip RLS policies

-- SELECT: main sees own trips; assistant sees trips of any linked main
CREATE POLICY "users can select scoped trips"
  ON public.trips FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_links
      WHERE main_user_id    = trips.owner_id
        AND assistant_user_id = auth.uid()
    )
  );

-- INSERT: created_by must be caller; owner_id must be self or a linked main
CREATE POLICY "users can insert scoped trips"
  ON public.trips FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.account_links
        WHERE main_user_id    = trips.owner_id
          AND assistant_user_id = auth.uid()
      )
    )
  );

-- UPDATE: same scope as SELECT; last_modified_by must be caller
CREATE POLICY "users can update scoped trips"
  ON public.trips FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_links
      WHERE main_user_id    = trips.owner_id
        AND assistant_user_id = auth.uid()
    )
  )
  WITH CHECK (last_modified_by = auth.uid());

-- DELETE: same scope as SELECT (both main and linked assistants can delete)
CREATE POLICY "users can delete scoped trips"
  ON public.trips FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_links
      WHERE main_user_id    = trips.owner_id
        AND assistant_user_id = auth.uid()
    )
  );

-- Step 7: RLS policies on account_links

-- Both sides of a link can read it
CREATE POLICY "users can read own links"
  ON public.account_links FOR SELECT TO authenticated
  USING (main_user_id = auth.uid() OR assistant_user_id = auth.uid());

-- Only main accounts can create links; main_user_id must be themselves
CREATE POLICY "main accounts can insert links"
  ON public.account_links FOR INSERT TO authenticated
  WITH CHECK (
    main_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'main'
    )
  );

-- Only the main account can remove their own links
CREATE POLICY "main accounts can delete links"
  ON public.account_links FOR DELETE TO authenticated
  USING (
    main_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'main'
    )
  );
