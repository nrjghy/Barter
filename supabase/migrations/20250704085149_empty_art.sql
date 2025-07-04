/*
  # Create toys table for toy listings

  1. New Tables
    - `toys`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key)
      - `title` (text)
      - `description` (text)
      - `category` (text)
      - `condition` (text)
      - `image_url` (text)
      - `tags` (text array)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `toys` table
    - Add policies for CRUD operations
*/

CREATE TABLE IF NOT EXISTS toys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  condition text NOT NULL,
  image_url text,
  tags text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE toys ENABLE ROW LEVEL SECURITY;

-- Users can read all active toys
CREATE POLICY "Users can read active toys"
  ON toys
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Users can insert their own toys
CREATE POLICY "Users can insert own toys"
  ON toys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own toys
CREATE POLICY "Users can update own toys"
  ON toys
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own toys
CREATE POLICY "Users can delete own toys"
  ON toys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_toys_user_id ON toys(user_id);
CREATE INDEX IF NOT EXISTS idx_toys_category ON toys(category);
CREATE INDEX IF NOT EXISTS idx_toys_created_at ON toys(created_at DESC);