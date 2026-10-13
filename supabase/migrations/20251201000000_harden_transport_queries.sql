/*
  # Harden transport_queries

  Problems in the original migration:
    - The SELECT policy used USING (true), so any anonymous client could read
      every user's queries.
    - The browser could insert arbitrary rows directly.

  Fix:
    - Drop both permissive policies. With RLS enabled and no policies, anon /
      authenticated roles have NO access. The edge function writes with the
      service role (which bypasses RLS) after validating input.
    - Replace the free-form user_id with a client-generated session_id and add
      observability columns (source, tools_used, latency_ms).
    - Constrain query length at the database level as defence in depth.
*/

DROP POLICY IF EXISTS "Users can insert own queries" ON transport_queries;
DROP POLICY IF EXISTS "Users can view own queries" ON transport_queries;

ALTER TABLE transport_queries DROP COLUMN IF EXISTS user_id;
ALTER TABLE transport_queries
  ADD COLUMN IF NOT EXISTS session_id text NOT NULL DEFAULT 'anonymous',
  ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('agent', 'rules')),
  ADD COLUMN IF NOT EXISTS tools_used text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS latency_ms integer;

ALTER TABLE transport_queries
  ADD CONSTRAINT transport_queries_query_length CHECK (char_length(query) BETWEEN 1 AND 500);

CREATE INDEX IF NOT EXISTS transport_queries_created_at_idx
  ON transport_queries (created_at DESC);

ALTER TABLE transport_queries ENABLE ROW LEVEL SECURITY;
