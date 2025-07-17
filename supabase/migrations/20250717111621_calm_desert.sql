/*
  # Add trade offers to swipes table

  1. New Columns
    - `offered_item_ids` (uuid[], nullable) - Array of item IDs the user is offering to trade

  2. Changes
    - Add offered_item_ids column to swipes table to store trade offers
    - Add index for efficient querying of trade offers
*/

-- Add offered_item_ids column to swipes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swipes' AND column_name = 'offered_item_ids'
  ) THEN
    ALTER TABLE swipes ADD COLUMN offered_item_ids uuid[];
  END IF;
END $$;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_swipes_offered_items 
ON swipes USING gin (offered_item_ids) 
WHERE offered_item_ids IS NOT NULL;