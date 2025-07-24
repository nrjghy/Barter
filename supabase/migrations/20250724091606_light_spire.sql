/*
  # Remove Multiple Items Support - Simplify to One-to-One Matching

  This migration removes support for multiple item offerings and simplifies the matching system to one-to-one item exchanges.

  ## Changes Made:
  1. Remove offered_item_ids columns from swipes table
  2. Remove user_id_1_offered_item_ids and user_id_2_offered_item_ids from matches table
  3. Update any related indexes and constraints
  4. Clean up any orphaned data

  ## Breaking Changes:
  - Existing matches with multiple offered items will lose that data
  - Swipe history with multiple offered items will be simplified
*/

-- Remove offered items columns from swipes table
ALTER TABLE swipes DROP COLUMN IF EXISTS offered_item_ids;

-- Remove offered items columns from matches table
ALTER TABLE matches DROP COLUMN IF EXISTS user_id_1_offered_item_ids;
ALTER TABLE matches DROP COLUMN IF EXISTS user_id_2_offered_item_ids;

-- Drop related indexes if they exist
DROP INDEX IF EXISTS idx_swipes_offered_items;
DROP INDEX IF EXISTS idx_matches_user1_offered_items;
DROP INDEX IF EXISTS idx_matches_user2_offered_items;

-- Remove offered_item_ids column from items table if it exists
ALTER TABLE items DROP COLUMN IF EXISTS offered_item_ids;