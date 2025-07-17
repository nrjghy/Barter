/*
  # Add trade offers to matches table

  1. New Columns
    - `user_id_1_offered_item_ids` (uuid[], nullable) - Items offered by user 1
    - `user_id_2_offered_item_ids` (uuid[], nullable) - Items offered by user 2

  2. Changes
    - Add trade offer columns to matches table
    - Add indexes for efficient querying of trade offers
*/

-- Add offered_item_ids columns to matches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_id_1_offered_item_ids'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_id_1_offered_item_ids uuid[];
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_id_2_offered_item_ids'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_id_2_offered_item_ids uuid[];
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_matches_user1_offered_items 
ON matches USING gin (user_id_1_offered_item_ids) 
WHERE user_id_1_offered_item_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_user2_offered_items 
ON matches USING gin (user_id_2_offered_item_ids) 
WHERE user_id_2_offered_item_ids IS NOT NULL;