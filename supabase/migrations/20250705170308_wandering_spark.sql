/*
  # Performance Optimization Indexes

  1. Database Indexes
    - Add composite indexes for common query patterns
    - Optimize dashboard and user item queries
    - Add indexes for match and report queries
    - Avoid oversized indexes that exceed PostgreSQL limits

  2. Performance Improvements
    - Faster item listing queries
    - Optimized user-specific queries
    - Better match lookup performance
    - Improved report filtering
*/

-- Composite index for items dashboard query (active items by category and date)
CREATE INDEX IF NOT EXISTS idx_items_active_category_created 
ON items (is_active, category, created_at DESC) 
WHERE is_active = true;

-- Composite index for user items (user's own items)
CREATE INDEX IF NOT EXISTS idx_items_user_created 
ON items (user_id, created_at DESC);

-- Index for items by category and condition (for filtering)
CREATE INDEX IF NOT EXISTS idx_items_category_condition 
ON items (category, condition) 
WHERE is_active = true;

-- Index for match queries by user and status
CREATE INDEX IF NOT EXISTS idx_matches_user_status 
ON matches (user_id_1, user_id_2, status, created_at DESC);

-- Additional index for reverse match lookups
CREATE INDEX IF NOT EXISTS idx_matches_user2_status 
ON matches (user_id_2, status, created_at DESC);

-- Index for reports by item and status
CREATE INDEX IF NOT EXISTS idx_reports_item_status 
ON reports (reported_item_id, status);

-- Index for reports by reporter
CREATE INDEX IF NOT EXISTS idx_reports_reporter_status 
ON reports (reporter_id, status, created_at DESC);

-- Partial index for active items only (optimized for dashboard)
CREATE INDEX IF NOT EXISTS idx_items_active_recent 
ON items (created_at DESC) 
WHERE is_active = true;

-- Index for items by tags (for tag-based searches)
CREATE INDEX IF NOT EXISTS idx_items_tags 
ON items USING GIN (tags) 
WHERE is_active = true;

-- Index for user location queries (simple btree index)
CREATE INDEX IF NOT EXISTS idx_users_location_btree 
ON users (latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for user ratings
CREATE INDEX IF NOT EXISTS idx_users_rating_active 
ON users (rating DESC, total_ratings DESC) 
WHERE rating IS NOT NULL;

-- Update table statistics for better query planning
ANALYZE items;
ANALYZE users;
ANALYZE matches;
ANALYZE reports;