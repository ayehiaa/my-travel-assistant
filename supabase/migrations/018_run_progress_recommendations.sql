CREATE TABLE public.run_progress (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  agent_name    text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'complete', 'error')),
  error_message text        NULL,
  completed_at  timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, agent_name)
);
ALTER TABLE public.run_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "run_progress_select_own" ON public.run_progress FOR SELECT
  USING (run_id IN (SELECT id FROM public.recommendations WHERE user_id = auth.uid()));

CREATE TABLE public.recommendations (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at             timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'complete', 'error')),
  target_allocation  jsonb       NULL,
  action_list        jsonb       NULL,
  summary_text       text        NULL,
  conflict_notes     text        NULL,
  agent_outputs      jsonb       NULL,
  portfolio_snapshot jsonb       NULL,
  error_message      text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recommendations_select_own" ON public.recommendations FOR SELECT
  USING (user_id = auth.uid());
CREATE INDEX recommendations_user_id_run_at ON public.recommendations(user_id, run_at DESC);
