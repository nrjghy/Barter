/*
  # Phase 2 Database Enhancements

  1. New Tables
    - `reviews` - User ratings and reviews for completed trades
    - `user_blocks` - User blocking relationships
    - `notifications` - In-app notification system
    - `item_values` - Estimated item values for better matching

  2. Table Updates
    - `users` - Add wishlist preferences and notification settings
    - `items` - Add estimated value field
    - `matches` - Add completion status and timestamps

  3. Security
    - Enable RLS on all new tables
    - Add appropriate policies for data access
*/

-- Add wishlist and notification preferences to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS wishlist_categories text[] DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"matches": true, "messages": true, "trades": true, "marketing": false}'::jsonb;

-- Add estimated value to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS estimated_value numeric(10,2);
ALTER TABLE items ADD COLUMN IF NOT EXISTS value_currency text DEFAULT 'USD';

-- Add completion tracking to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES users(id);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  trade_experience text CHECK (trade_experience IN ('excellent', 'good', 'fair', 'poor')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, reviewer_id)
);

-- Create user blocks table
CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('match', 'message', 'trade_completed', 'review', 'system')),
  title text NOT NULL,
  content text NOT NULL,
  data jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

-- Create item values tracking table for analytics
CREATE TABLE IF NOT EXISTS item_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  estimated_value numeric(10,2) NOT NULL,
  confidence_score numeric(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  valuation_method text DEFAULT 'user_input',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_values ENABLE ROW LEVEL SECURITY;

-- Reviews policies
CREATE POLICY "Users can read reviews about themselves or their trades"
  ON reviews FOR SELECT
  TO authenticated
  USING (
    reviewer_id = auth.uid() OR 
    reviewee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM matches 
      WHERE matches.id = reviews.match_id 
      AND (matches.user_id_1 = auth.uid() OR matches.user_id_2 = auth.uid())
    )
  );

CREATE POLICY "Users can create reviews for their completed trades"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM matches 
      WHERE matches.id = reviews.match_id 
      AND (matches.user_id_1 = auth.uid() OR matches.user_id_2 = auth.uid())
      AND matches.status = 'accepted'
    )
  );

-- User blocks policies
CREATE POLICY "Users can manage their own blocks"
  ON user_blocks FOR ALL
  TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_match_id ON reviews(match_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_values_item_id ON item_values(item_id);
CREATE INDEX IF NOT EXISTS idx_users_wishlist ON users USING gin(wishlist_categories);

-- Function to update user rating based on reviews
CREATE OR REPLACE FUNCTION update_user_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the reviewee's rating
  UPDATE users 
  SET 
    rating_sum = COALESCE((
      SELECT SUM(rating) 
      FROM reviews 
      WHERE reviewee_id = NEW.reviewee_id
    ), 0),
    total_ratings = COALESCE((
      SELECT COUNT(*) 
      FROM reviews 
      WHERE reviewee_id = NEW.reviewee_id
    ), 0),
    rating = CASE 
      WHEN (SELECT COUNT(*) FROM reviews WHERE reviewee_id = NEW.reviewee_id) > 0 
      THEN (
        SELECT ROUND(AVG(rating)::numeric, 2) 
        FROM reviews 
        WHERE reviewee_id = NEW.reviewee_id
      )
      ELSE 4.0 
    END
  WHERE id = NEW.reviewee_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update ratings when reviews are added
DROP TRIGGER IF EXISTS update_user_rating_trigger ON reviews;
CREATE TRIGGER update_user_rating_trigger
  AFTER INSERT ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_user_rating();

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_content text,
  p_data jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  notification_id uuid;
BEGIN
  INSERT INTO notifications (user_id, type, title, content, data)
  VALUES (p_user_id, p_type, p_title, p_content, p_data)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;