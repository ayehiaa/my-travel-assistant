-- alpaca_credentials
CREATE TABLE alpaca_credentials (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_key_id text NOT NULL,
  key_id_iv        text NOT NULL,
  encrypted_secret text NOT NULL,
  secret_iv        text NOT NULL,
  is_paper         boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alpaca_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own credentials"
  ON alpaca_credentials FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- alpaca_executions
CREATE TABLE alpaca_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  is_paper          boolean NOT NULL,
  orders            jsonb NOT NULL DEFAULT '[]',
  UNIQUE (recommendation_id)
);

ALTER TABLE alpaca_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own executions"
  ON alpaca_executions FOR SELECT
  USING (user_id = auth.uid());
