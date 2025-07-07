/*
  # Performance Optimization Indexes

  1. New Indexes
    - Composite index for items filtering and sorting
    - Optimized indexes for frequently accessed columns
    - Partial indexes for active items only
    - Avoid oversized indexes that exceed PostgreSQL limits

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

-- Index for items by category and condition (for filtering)
CREATE INDEX IF NOT EXISTS idx_items_category_condition 
ON items (category, condition) 
WHERE is_active = true;

-- Index for match queries
CREATE INDEX IF NOT EXISTS idx_matches_user_status 
ON matches (user_id_1, user_id_2, status, created_at DESC);

-- Index for reports
CREATE INDEX IF NOT EXISTS idx_reports_item_status 
ON reports (reported_item_id, status);

-- Partial index for active items only
CREATE INDEX IF NOT EXISTS idx_items_active_recent 
ON items (created_at DESC) 
WHERE is_active = true;

-- Index for items by tags (for tag-based searches)
CREATE INDEX IF NOT EXISTS idx_items_tags 
ON items USING GIN (tags) 
WHERE is_active = true;

-- Simple btree index for location queries
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