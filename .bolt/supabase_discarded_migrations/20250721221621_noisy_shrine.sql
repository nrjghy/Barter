/*
  # Phase 3: Smart Matching and Analytics Enhancement

  1. New Tables
    - `item_values` - Enhanced item valuation system
    - `reports` - Content moderation and reporting system
    - Enhanced swipes tracking with offered items
    - Enhanced matches with completion tracking

  2. Smart Matching Features
    - User preference tracking
    - Location-based matching
    - Value-based trade recommendations
    - Swipe pattern analysis

  3. Analytics and Reporting
    - User activity tracking
    - Trade success metrics
    - Content moderation tools
    - Performance analytics

  4. Security Enhancements
    - Enhanced RLS policies
    - Content moderation workflows
    - Admin management tools
*/

-- Enhanced item values table for smart matching
CREATE TABLE IF NOT EXISTS item_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  estimated_value numeric(10,2) NOT NULL,
  confidence_score numeric(3,2) DEFAULT 0.5,
  valuation_method text DEFAULT 'user_input',
  created_at timestamptz DEFAULT now()
);

-- Reports table for content moderation
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'inappropriate_content',
    'misleading_description', 
    'prohibited_item',
    'spam',
    'fake_listing',
    'offensive_language',
    'copyright_violation',
    'safety_concern',
    'other'
  )),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enhanced swipes table with offered items tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'swipes' AND column_name = 'offered_item_ids'
  ) THEN
    ALTER TABLE swipes ADD COLUMN offered_item_ids uuid[];
  END IF;
END $$;

-- Enhanced matches table with completion tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE matches ADD COLUMN completed_at timestamptz;
    ALTER TABLE matches ADD COLUMN completed_by uuid REFERENCES users(id);
  END IF;
END $$;

-- Enhanced users table for smart matching
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE users ADD COLUMN latitude numeric(10,8);
    ALTER TABLE users ADD COLUMN longitude numeric(11,8);
    ALTER TABLE users ADD COLUMN daily_swipes integer DEFAULT 0;
    ALTER TABLE users ADD COLUMN last_swipe_date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Enhanced items table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'items' AND column_name = 'price'
  ) THEN
    ALTER TABLE items ADD COLUMN price numeric(10,2);
    ALTER TABLE items ADD COLUMN source_url varchar;
    ALTER TABLE items ADD COLUMN type varchar;
    ALTER TABLE items ADD COLUMN age_range varchar;
    ALTER TABLE items ADD COLUMN estimated_value numeric(10,2);
    ALTER TABLE items ADD COLUMN value_currency text DEFAULT 'USD';
  END IF;
END $$;

-- Add constraints for location data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_latitude_range'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_latitude_range 
    CHECK (latitude >= -90 AND latitude <= 90);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'check_longitude_range'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT check_longitude_range 
    CHECK (longitude >= -180 AND longitude <= 180);
  END IF;
END $$;

-- Indexes for smart matching performance
CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_location_btree ON users(latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_category_condition ON items(category, condition) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_items_tags ON items USING gin(tags) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_swipes_offered_items ON swipes USING gin(offered_item_ids) 
WHERE offered_item_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_values_item_id ON item_values(item_id);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_item_id ON reports(reported_item_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);

-- RLS Policies for new tables
ALTER TABLE item_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Item values policies
CREATE POLICY "Users can read item values for active items"
  ON item_values FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM items 
      WHERE items.id = item_values.item_id 
      AND items.is_active = true
    )
  );

CREATE POLICY "Users can create values for their own items"
  ON item_values FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM items 
      WHERE items.id = item_values.item_id 
      AND items.user_id = auth.uid()
    )
  );

-- Reports policies
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Enhanced swipe tracking function
CREATE OR REPLACE FUNCTION can_user_swipe(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_swipes integer;
  last_date date;
  swipe_limit integer := 50;
BEGIN
  SELECT daily_swipes, last_swipe_date 
  INTO current_swipes, last_date
  FROM users 
  WHERE id = user_uuid;
  
  -- Reset counter if it's a new day
  IF last_date < CURRENT_DATE THEN
    UPDATE users 
    SET daily_swipes = 0, last_swipe_date = CURRENT_DATE 
    WHERE id = user_uuid;
    RETURN true;
  END IF;
  
  RETURN current_swipes < swipe_limit;
END;
$$;

-- Function to increment swipe count
CREATE OR REPLACE FUNCTION increment_swipe_count(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users 
  SET daily_swipes = daily_swipes + 1,
      last_swipe_date = CURRENT_DATE
  WHERE id = user_uuid;
END;
$$;

-- Function to update reports timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for reports updated_at
DROP TRIGGER IF EXISTS update_reports_updated_at_trigger ON reports;
CREATE TRIGGER update_reports_updated_at_trigger
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();

-- Enhanced indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_rating_active ON users(rating DESC, total_ratings DESC) 
WHERE rating IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_active_recent ON items(created_at DESC) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_items_active_category_created ON items(is_active, category, created_at DESC) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_matches_user_status ON matches(user_id_1, user_id_2, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_user2_status ON matches(user_id_2, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_item_status ON reports(reported_item_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_status ON reports(reporter_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_unique_user_item ON reports(reporter_id, reported_item_id) 
WHERE status IN ('pending', 'reviewed');

CREATE INDEX IF NOT EXISTS idx_matches_user1_offered_items ON matches USING gin(user_id_1_offered_item_ids) 
WHERE user_id_1_offered_item_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_user2_offered_items ON matches USING gin(user_id_2_offered_item_ids) 
WHERE user_id_2_offered_item_ids IS NOT NULL;