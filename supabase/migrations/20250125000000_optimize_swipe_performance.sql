/*
  # Optimize Swipe Performance

  1. New Functions
    - Create `record_swipe_optimized` function that batches operations
    - Optimize existing functions for better performance
    - Add background match checking

  2. Performance Improvements
    - Reduce database roundtrips
    - Return all necessary data in single response
    - Optimize match checking logic
*/

-- Optimized function to record swipe with batched operations
CREATE OR REPLACE FUNCTION record_swipe_optimized(
  user_uuid uuid,
  target_item_id uuid,
  swipe_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_swipes integer;
  last_swipe date;
  swipe_limit integer := 50;
  can_swipe boolean := false;
  result jsonb := '{}';
  target_item_user_id uuid;
  match_created boolean := false;
  match_id uuid;
BEGIN
  -- Validate direction
  IF swipe_direction NOT IN ('left', 'right', 'super') THEN
    RETURN jsonb_build_object('error', 'Invalid swipe direction');
  END IF;

  -- Get current swipe count and last swipe date
  SELECT daily_swipes, last_swipe_date
  INTO current_swipes, last_swipe
  FROM users
  WHERE id = user_uuid;
  
  -- If user not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  
  -- If last swipe was not today, reset the counter
  IF last_swipe != CURRENT_DATE THEN
    current_swipes := 0;
  END IF;
  
  -- Check if user is under the limit
  can_swipe := current_swipes < swipe_limit;
  
  IF NOT can_swipe THEN
    RETURN jsonb_build_object(
      'error', 'Daily swipe limit reached',
      'dailySwipeCount', current_swipes,
      'canSwipe', false
    );
  END IF;

  -- Record the swipe (ignore duplicates)
  INSERT INTO swipes (user_id, item_id, direction)
  VALUES (user_uuid, target_item_id, swipe_direction)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  -- Increment swipe count and update last swipe date
  UPDATE users 
  SET 
    daily_swipes = CASE 
      WHEN last_swipe_date != CURRENT_DATE THEN 1
      ELSE daily_swipes + 1
    END,
    last_swipe_date = CURRENT_DATE
  WHERE id = user_uuid;

  -- Get updated swipe count
  SELECT daily_swipes INTO current_swipes FROM users WHERE id = user_uuid;

  -- For right swipes, check for potential matches (simplified check)
  IF swipe_direction IN ('right', 'super') THEN
    -- Get the target item's owner
    SELECT user_id INTO target_item_user_id 
    FROM items 
    WHERE id = target_item_id AND is_active = true;
    
    IF target_item_user_id IS NOT NULL THEN
      -- Check if there's a mutual swipe (simplified version)
      -- This will be optimized further with proper indexing
      SELECT EXISTS(
        SELECT 1 FROM swipes s1
        JOIN items i1 ON s1.item_id = i1.id
        WHERE s1.user_id = target_item_user_id
        AND i1.user_id = user_uuid
        AND i1.is_active = true
        AND s1.direction IN ('right', 'super')
      ) INTO match_created;
      
      -- If match found, we'll handle match creation in a separate optimized flow
      -- For now, just indicate that a match check should be performed
    END IF;
  END IF;

  -- Build result
  result := jsonb_build_object(
    'success', true,
    'dailySwipeCount', current_swipes,
    'canSwipe', current_swipes < swipe_limit,
    'matchCheckNeeded', swipe_direction IN ('right', 'super') AND target_item_user_id IS NOT NULL,
    'targetItemUserId', target_item_user_id
  );

  RETURN result;
END;
$$;

-- Optimized function to check and create matches in background
CREATE OR REPLACE FUNCTION check_and_create_match(
  swiper_user_id uuid,
  target_item_id uuid,
  is_super_like boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_item_user_id uuid;
  swiper_item_id uuid;
  existing_match_id uuid;
  new_match_id uuid;
  result jsonb := '{}';
BEGIN
  -- Get target item details
  SELECT user_id INTO target_item_user_id
  FROM items 
  WHERE id = target_item_id AND is_active = true;
  
  IF target_item_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Target item not found or inactive');
  END IF;

  -- Find mutual swipe more efficiently
  SELECT i.id INTO swiper_item_id
  FROM items i
  JOIN swipes s ON s.item_id = i.id
  WHERE i.user_id = swiper_user_id
  AND i.is_active = true
  AND s.user_id = target_item_user_id
  AND s.direction IN ('right', 'super')
  LIMIT 1;

  IF swiper_item_id IS NULL THEN
    RETURN jsonb_build_object('matchCreated', false, 'reason', 'No mutual swipe found');
  END IF;

  -- Check for existing match
  SELECT id INTO existing_match_id
  FROM matches
  WHERE (item_id_1 = swiper_item_id AND item_id_2 = target_item_id)
     OR (item_id_1 = target_item_id AND item_id_2 = swiper_item_id);

  IF existing_match_id IS NOT NULL THEN
    RETURN jsonb_build_object('matchCreated', false, 'reason', 'Match already exists');
  END IF;

  -- Create the match
  INSERT INTO matches (
    item_id_1, item_id_2, user_id_1, user_id_2, 
    status, is_super_like
  )
  VALUES (
    swiper_item_id, target_item_id, swiper_user_id, target_item_user_id,
    'pending', is_super_like
  )
  RETURNING id INTO new_match_id;

  RETURN jsonb_build_object(
    'matchCreated', true,
    'matchId', new_match_id,
    'swiperItemId', swiper_item_id,
    'targetItemId', target_item_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_swipe_optimized(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_create_match(uuid, uuid, boolean) TO authenticated;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_swipes_user_item_direction ON swipes(user_id, item_id, direction);
CREATE INDEX IF NOT EXISTS idx_items_user_active ON items(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_matches_items ON matches(item_id_1, item_id_2);
CREATE INDEX IF NOT EXISTS idx_users_swipe_data ON users(id, daily_swipes, last_swipe_date);
