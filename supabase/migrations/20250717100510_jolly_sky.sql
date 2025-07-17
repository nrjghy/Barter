/*
  # Add source URL field to items table

  1. Changes
    - Add `source_url` column to `items` table to store original listing URLs
    - Add index for source_url for efficient lookups
    - Add constraint to ensure URL format is valid

  2. Security
    - No RLS changes needed as this inherits existing item policies
*/

-- Add source_url column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_url text;

-- Add index for source_url lookups
CREATE INDEX IF NOT EXISTS idx_items_source_url ON items(source_url) WHERE source_url IS NOT NULL;

-- Add constraint to ensure URL format (basic validation)
ALTER TABLE items ADD CONSTRAINT IF NOT EXISTS check_source_url_format 
  CHECK (source_url IS NULL OR source_url ~* '^https?://.*');

-- Add comment for documentation
COMMENT ON COLUMN items.source_url IS 'Original listing URL from external sources like Carousell';