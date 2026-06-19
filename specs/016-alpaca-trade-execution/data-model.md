# Data Model: Alpaca Trade Execution

## Existing Type Changes

### `AuditAction` (`src/types/database.ts`)
Add three new values:
```ts
| 'alpaca_credentials_connected'
| 'alpaca_credentials_disconnected'
| 'alpaca_executed'
```

---

## New Tables

### `alpaca_credentials`
One row per user. Upserted on reconnect (replacing previous credentials).

```sql
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
```

RLS:
```sql
ALTER TABLE alpaca_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own credentials"
  ON alpaca_credentials
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

TypeScript interface (in `src/types/database.ts`):
```ts
export interface AlpacaCredential {
  user_id: string
  encrypted_key_id: string
  key_id_iv: string
  encrypted_secret: string
  secret_iv: string
  is_paper: boolean
  created_at: string
  updated_at: string
}
```

---

### `alpaca_executions`
One row per executed recommendation. Created on first execution attempt; never updated (immutable record).

```sql
CREATE TABLE alpaca_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  is_paper          boolean NOT NULL,
  orders            jsonb NOT NULL DEFAULT '[]',
  UNIQUE (recommendation_id)
);
```

RLS:
```sql
ALTER TABLE alpaca_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own executions"
  ON alpaca_executions
  FOR SELECT
  USING (user_id = auth.uid());
```

Note: Writes to `alpaca_executions` use `createAdminClient()` (service role) from the execute API route — same pattern as `logAudit()`. RLS allows reads for the user's own rows; the API layer enforces auth before any admin write.

`orders` JSONB shape (array of `AlpacaOrderResult`):
```ts
export interface AlpacaOrderResult {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  price_at_execution: number
  estimated_value: number
  alpaca_order_id: string | null
  status: 'submitted' | 'rejected' | 'error' | 'skipped'
  error_message: string | null
}

export interface AlpacaExecution {
  id: string
  recommendation_id: string
  user_id: string
  executed_at: string
  is_paper: boolean
  orders: AlpacaOrderResult[]
}
```

---

## Migration File

Filename: `supabase/migrations/20260619_alpaca_trade_execution.sql`

```sql
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
```
