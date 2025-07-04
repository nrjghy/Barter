/*
  # Rename toys table to items for generic use

  1. Changes
    - Rename `toys` table to `items`
    - Update all foreign key references
    - Update indexes and policies
    - Maintain all existing functionality

  2. Security
    - Preserve all existing RLS policies
    - Update policy references to new table name
*/

-- Rename the toys table to items
ALTER TABLE toys RENAME TO items;

-- Update the matches table foreign key column names
ALTER TABLE matches RENAME COLUMN toy_id_1 TO item_id_1;
ALTER TABLE matches RENAME COLUMN toy_id_2 TO item_id_2;

-- Update foreign key constraint names
ALTER TABLE matches DROP CONSTRAINT matches_toy_id_1_fkey;
ALTER TABLE matches DROP CONSTRAINT matches_toy_id_2_fkey;

ALTER TABLE matches ADD CONSTRAINT matches_item_id_1_fkey 
  FOREIGN KEY (item_id_1) REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE matches ADD CONSTRAINT matches_item_id_2_fkey 
  FOREIGN KEY (item_id_2) REFERENCES items(id) ON DELETE CASCADE;

-- Update index names
DROP INDEX IF EXISTS idx_toys_category;
DROP INDEX IF EXISTS idx_toys_created_at;
DROP INDEX IF EXISTS idx_toys_user_id;

CREATE INDEX idx_items_category ON items USING btree (category);
CREATE INDEX idx_items_created_at ON items USING btree (created_at DESC);
CREATE INDEX idx_items_user_id ON items USING btree (user_id);

-- Update match indexes to reflect new column names
DROP INDEX IF EXISTS idx_matches_unique;
CREATE UNIQUE INDEX idx_matches_unique ON matches USING btree (GREATEST(item_id_1, item_id_2), LEAST(item_id_1, item_id_2));