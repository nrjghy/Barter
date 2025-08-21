/*
  # Add source_url column to items table

  1. Changes
    - Add `source_url` column to `items` table
    - Column allows NULL values for existing items
    - Add index for efficient lookups
    - Add constraint to validate URL format

  2. Security
    - No RLS changes needed as this is just adding a column
*/

-- Add source_url column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_url text;

-- Add index for efficient lookups on source_url
CREATE INDEX IF NOT EXISTS idx_items_source_url ON items(source_url) WHERE source_url IS NOT NULL;

-- Add constraint to validate URL format (basic validation)
ALTER TABLE items ADD CONSTRAINT IF NOT EXISTS check_source_url_format 
  CHECK (source_url IS NULL OR source_url ~ '^https?://');