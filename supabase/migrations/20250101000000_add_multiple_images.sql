/*
  # Add Multiple Images Support
  
  This migration adds support for multiple images per item by:
  1. Adding image_urls array column to items table
  2. Setting default value as empty array
  3. Maintaining backward compatibility
*/

-- Add image_urls array column for multiple images
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN items.image_urls IS 'Array of image URLs for the item. Each URL points to an image stored in Supabase Storage.';

-- Optional: Create index for better performance when querying by image_urls
CREATE INDEX IF NOT EXISTS idx_items_image_urls ON items USING GIN (image_urls);

-- Note: The old image_url column is kept for backward compatibility
-- You can remove it later after ensuring all data is migrated
-- ALTER TABLE items DROP COLUMN IF EXISTS image_url;
