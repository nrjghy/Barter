/*
  # Performance Optimization Indexes

  1. New Indexes
    - Composite index for items filtering and sorting
    - Spatial index for location-based queries
    - Covering indexes for frequently accessed columns
    - Partial indexes for active items only

  2. Query Optimization
    - Add indexes to support common query patterns
    - Optimize join operations
    - Improve sorting performance
*/

-- Composite index for items dashboard query
CREATE INDEX IF NOT EXISTS idx_items_active_category_created 
ON items (is_active, category, created_at DESC) 
WHERE is_active = true;

-- Composite index for user items
CREATE INDEX IF NOT EXISTS idx_items_user_created 
ON items (user_id, created_at DESC);

-- Spatial index for location queries (if PostGIS available)
-- CREATE INDEX IF NOT EXISTS idx_users_location_gist 
-- ON users USING GIST (ST_Point(longitude, latitude)) 
-- WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Covering index for items with user data
CREATE INDEX IF NOT EXISTS idx_items_with_user_data 
ON items (id, user_id, title, category, condition, image_url, created_at) 
WHERE is_active = true;

-- Index for match queries
CREATE INDEX IF NOT EXISTS idx_matches_user_status 
ON matches (user_id_1, user_id_2, status, created_at DESC);

-- Index for reports
CREATE INDEX IF NOT EXISTS idx_reports_item_status 
ON reports (reported_item_id, status);

-- Partial index for active items only
CREATE INDEX IF NOT EXISTS idx_items_active_only 
ON items (created_at DESC, category) 
WHERE is_active = true;

-- Update table statistics for better query planning
ANALYZE items;
ANALYZE users;
ANALYZE matches;
ANALYZE reports;