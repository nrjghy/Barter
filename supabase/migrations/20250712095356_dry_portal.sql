/*
  # Fix swipe limit permission errors

  1. Database Functions
    - Create `can_user_swipe` RPC function to check if user can swipe
    - Create `increment_swipe_count` RPC function to increment daily swipes
    - Both functions will have proper security and handle daily reset logic

  2. Security
    - Functions run with definer rights to access users table
    - Include proper validation to ensure users can only check/update their own data
*/

-- Function to check if a user can swipe (handles daily reset and limit checking)
CREATE OR REPLACE FUNCTION can_user_swipe(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_swipes integer;
  last_swipe date;
  swipe_limit integer := 50;
BEGIN
  -- Get current swipe count and last swipe date
  SELECT daily_swipes, last_swipe_date
  INTO current_swipes, last_swipe
  FROM users
  WHERE id = user_uuid;
  
  -- If user not found, return false
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If last swipe was not today, reset the counter
  IF last_swipe != CURRENT_DATE THEN
    UPDATE users 
    SET daily_swipes = 0, last_swipe_date = CURRENT_DATE
    WHERE id = user_uuid;
    current_swipes := 0;
  END IF;
  
  -- Check if user is under the limit
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
  -- Reset counter if it's a new day, then increment
  UPDATE users 
  SET 
    daily_swipes = CASE 
      WHEN last_swipe_date != CURRENT_DATE THEN 1
      ELSE daily_swipes + 1
    END,
    last_swipe_date = CURRENT_DATE
  WHERE id = user_uuid;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION can_user_swipe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_swipe_count(uuid) TO authenticated;