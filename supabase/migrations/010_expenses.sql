-- expense_categories: fixed lookup table, seeded below
CREATE TABLE public.expense_categories (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  display_order smallint    NOT NULL
);

-- Seed the 7 fixed categories in prescribed order
INSERT INTO public.expense_categories (name, display_order) VALUES
  ('Accommodation',          1),
  ('Meals & entertainment',  2),
  ('Transport',              3),
  ('Flights',                4),
  ('Visa & fees',            5),
  ('Equipment',              6),
  ('Other',                  7);

-- expenses: core expense record
CREATE TABLE public.expenses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id          uuid        REFERENCES public.trips(id) ON DELETE SET NULL,
  category_id      uuid        NOT NULL REFERENCES public.expense_categories(id),
  title            text        NOT NULL,
  amount           numeric     NOT NULL CHECK (amount >= 0),
  currency         text        NOT NULL,
  expense_date     date        NOT NULL,
  notes            text,
  receipt_url      text,
  receipt_name     text,
  reclaimed        boolean     NOT NULL DEFAULT false,
  reclaimed_at     timestamptz,
  reclaimed_by     uuid        REFERENCES auth.users(id),
  created_by       uuid        NOT NULL REFERENCES auth.users(id),
  last_modified_by uuid        NOT NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger: keep expenses.updated_at current
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes for common access patterns
CREATE INDEX expenses_owner_id_idx ON public.expenses (owner_id, expense_date DESC);
CREATE INDEX expenses_trip_id_idx  ON public.expenses (trip_id) WHERE trip_id IS NOT NULL;

-- Row-Level Security
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;

-- expense_categories: all authenticated users can read (static lookup)
CREATE POLICY "authenticated users can read expense_categories"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (true);

-- expenses SELECT: owner sees own; active linked assistant sees owner's expenses
CREATE POLICY "users can select scoped expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_links
      WHERE main_user_id      = expenses.owner_id
        AND assistant_user_id = auth.uid()
        AND status            = 'active'
    )
  );

-- expenses INSERT: created_by must be caller; owner_id must be self or an active linked main
CREATE POLICY "users can insert scoped expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.account_links
        WHERE main_user_id      = expenses.owner_id
          AND assistant_user_id = auth.uid()
          AND status            = 'active'
      )
    )
  );

-- expenses UPDATE: same scope as SELECT; re-assert scope and last_modified_by in WITH CHECK
CREATE POLICY "users can update scoped expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.account_links
      WHERE main_user_id      = expenses.owner_id
        AND assistant_user_id = auth.uid()
        AND status            = 'active'
    )
  )
  WITH CHECK (
    last_modified_by = auth.uid()
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.account_links
        WHERE main_user_id      = expenses.owner_id
          AND assistant_user_id = auth.uid()
          AND status            = 'active'
      )
    )
  );

-- expenses DELETE: owner only
CREATE POLICY "owner can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
