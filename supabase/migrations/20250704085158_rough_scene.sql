/*
  # Create matches table for toy exchanges

  1. New Tables
    - `matches`
      - `id` (uuid, primary key)
      - `toy_id_1` (uuid, foreign key)
      - `toy_id_2` (uuid, foreign key)
      - `user_id_1` (uuid, foreign key)
      - `user_id_2` (uuid, foreign key)
      - `status` (text) - pending, accepted, rejected
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `matches` table
    - Add policies for match operations
*/

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  toy_id_1 uuid NOT NULL REFERENCES toys(id) ON DELETE CASCADE,
  toy_id_2 uuid NOT NULL REFERENCES toys(id) ON DELETE CASCADE,
  user_id_1 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Users can read matches involving their toys
CREATE POLICY "Users can read their matches"
  ON matches
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Users can insert matches for their toys
CREATE POLICY "Users can create matches"
  ON matches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Users can update matches involving their toys
CREATE POLICY "Users can update their matches"
  ON matches
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_matches_user_id_1 ON matches(user_id_1);
CREATE INDEX IF NOT EXISTS idx_matches_user_id_2 ON matches(user_id_2);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at DESC);

-- Unique constraint to prevent duplicate matches
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique 
ON matches(
  GREATEST(toy_id_1, toy_id_2),
  LEAST(toy_id_1, toy_id_2)
);