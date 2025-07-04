/*
  # Add user ratings and location coordinates

  1. New Columns
    - Add `rating` column to users table for seller ratings
    - Add `latitude` and `longitude` columns for precise location data
    - Add `total_ratings` and `rating_sum` for rating calculations

  2. Indexes
    - Add spatial index for location-based queries
    - Add index on rating for filtering

  3. Functions
    - Add function to update user ratings
*/

-- Add rating columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 4.0,
ADD COLUMN IF NOT EXISTS total_ratings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rating_sum INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_rating ON users (rating);
CREATE INDEX IF NOT EXISTS idx_users_location ON users (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add spatial index for location queries (if PostGIS is available)
-- CREATE INDEX IF NOT EXISTS idx_users_location_gist ON users USING GIST (ST_Point(longitude, latitude)) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Function to update user rating
CREATE OR REPLACE FUNCTION update_user_rating(user_id UUID, new_rating INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE users 
  SET 
    rating_sum = rating_sum + new_rating,
    total_ratings = total_ratings + 1,
    rating = CASE 
      WHEN total_ratings + 1 > 0 THEN 
        ROUND((rating_sum + new_rating)::DECIMAL / (total_ratings + 1), 2)
      ELSE 4.0 
    END,
    updated_at = now()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Add check constraint for rating
ALTER TABLE users ADD CONSTRAINT check_rating_range 
CHECK (rating >= 1.0 AND rating <= 5.0);

-- Add check constraint for coordinates
ALTER TABLE users ADD CONSTRAINT check_latitude_range 
CHECK (latitude >= -90 AND latitude <= 90);

ALTER TABLE users ADD CONSTRAINT check_longitude_range 
CHECK (longitude >= -180 AND longitude <= 180);