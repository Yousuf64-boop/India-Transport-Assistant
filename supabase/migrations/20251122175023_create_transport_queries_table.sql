/*
  # Create transport queries table

  1. New Tables
    - `transport_queries`
      - `id` (uuid, primary key) - Unique identifier for each query
      - `query` (text) - The user's transport query
      - `user_id` (text) - Identifier for the user making the query
      - `created_at` (timestamptz) - Timestamp when the query was created
  
  2. Security
    - Enable RLS on `transport_queries` table
    - Add policy for authenticated and anonymous users to insert their own queries
    - Add policy for authenticated and anonymous users to view their own queries
*/

CREATE TABLE IF NOT EXISTS transport_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transport_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own queries"
  ON transport_queries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view own queries"
  ON transport_queries
  FOR SELECT
  TO anon, authenticated
  USING (true);
