/*
  # Check and Fix Demo Data Visibility

  1. Verify demo data exists
  2. Check RLS policies
  3. Ensure items are properly linked to demo users
  4. Add missing demo items if needed
*/

-- First, let's check if demo users exist
DO $$
BEGIN
  RAISE NOTICE 'Demo users count: %', (SELECT COUNT(*) FROM users WHERE is_demo = true);
  RAISE NOTICE 'Demo items count: %', (SELECT COUNT(*) FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true));
  RAISE NOTICE 'Active demo items count: %', (SELECT COUNT(*) FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true) AND is_active = true);
END $$;

-- Ensure all demo items are active
UPDATE items 
SET is_active = true 
WHERE user_id IN (SELECT id FROM users WHERE is_demo = true);

-- Add more demo items if we don't have enough
DO $$
DECLARE
  demo_user_ids uuid[];
  current_item_count integer;
BEGIN
  -- Get all demo user IDs
  SELECT ARRAY(SELECT id FROM users WHERE is_demo = true ORDER BY username) INTO demo_user_ids;
  
  -- Check current item count
  SELECT COUNT(*) INTO current_item_count FROM items WHERE user_id = ANY(demo_user_ids);
  
  -- If we have fewer than 50 items, add more
  IF current_item_count < 50 THEN
    -- Add additional items for each demo user
    INSERT INTO items (user_id, title, description, category, condition, price, image_url, tags, created_at) VALUES
    -- Additional items for better variety
    (demo_user_ids[1], 'Smart Home Hub', 'Complete smart home automation system with voice control and mobile app. Control lights, temperature, and security from anywhere.', 'Electronics', 'Like New', 200.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['smart-home', 'automation', 'iot', 'tech'], NOW() - INTERVAL '12 days'),
    (demo_user_ids[1], 'Drone with 4K Camera', 'Professional-grade drone with 4K camera and gimbal stabilization. Perfect for aerial photography and videography.', 'Electronics', 'Very Good', 380.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['drone', 'camera', '4k', 'photography'], NOW() - INTERVAL '8 days'),
    
    (demo_user_ids[2], 'Vintage Band T-Shirt Collection', 'Authentic vintage band t-shirts from the 70s-90s. Includes rare concert tees and tour merchandise. Sizes M-L.', 'Clothing', 'Good', 150.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', 'band', 't-shirts', 'concert'], NOW() - INTERVAL '11 days'),
    (demo_user_ids[2], 'Antique Jewelry Box', 'Beautiful antique wooden jewelry box with velvet interior and multiple compartments. Perfect for storing vintage jewelry.', 'Home & Garden', 'Very Good', 85.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['antique', 'jewelry', 'storage', 'vintage'], NOW() - INTERVAL '7 days'),
    
    (demo_user_ids[3], 'Classic Literature Set', 'Complete works of Shakespeare, Dickens, and other classic authors. Leather-bound editions in excellent condition.', 'Books', 'Very Good', 300.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['classic', 'literature', 'leather-bound', 'shakespeare'], NOW() - INTERVAL '9 days'),
    (demo_user_ids[3], 'Academic Journal Collection', 'Collection of academic journals covering literature, philosophy, and humanities. Perfect for researchers and students.', 'Books', 'Good', 120.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['academic', 'journals', 'research', 'humanities'], NOW() - INTERVAL '13 days'),
    
    (demo_user_ids[4], 'Quilting Fabric Bundle', 'Large collection of premium quilting fabrics in various patterns and colors. Enough material for multiple projects.', 'Art & Crafts', 'Like New', 95.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['quilting', 'fabric', 'crafts', 'sewing'], NOW() - INTERVAL '6 days'),
    (demo_user_ids[4], 'Pottery Glazing Kit', 'Complete pottery glazing kit with brushes, underglazes, and clear coat. Perfect for finishing ceramic pieces.', 'Art & Crafts', 'Like New', 75.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['pottery', 'glazing', 'ceramics', 'art'], NOW() - INTERVAL '14 days'),
    
    (demo_user_ids[5], 'Protein Powder Collection', 'Variety pack of premium protein powders: whey, casein, and plant-based. All unopened and within expiration dates.', 'Sports & Outdoors', 'Like New', 80.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['protein', 'supplements', 'fitness', 'nutrition'], NOW() - INTERVAL '4 days'),
    (demo_user_ids[5], 'Exercise Bike', 'Stationary exercise bike with digital display and adjustable resistance. Perfect for cardio workouts at home.', 'Sports & Outdoors', 'Good', 220.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['exercise', 'bike', 'cardio', 'home-gym'], NOW() - INTERVAL '15 days'),
    
    (demo_user_ids[6], 'Vintage Amplifier', 'Classic tube amplifier from the 1970s. Warm, rich sound perfect for guitar or general audio. Recently serviced.', 'Music & Instruments', 'Good', 350.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['amplifier', 'tube', 'vintage', 'audio'], NOW() - INTERVAL '16 days'),
    (demo_user_ids[6], 'Music Production Software', 'Professional music production software bundle with plugins and samples. Perfect for home recording studios.', 'Electronics', 'Like New', 180.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['music', 'software', 'production', 'recording'], NOW() - INTERVAL '5 days'),
    
    (demo_user_ids[7], 'Board Game Collection', 'Collection of modern board games including strategy, party, and cooperative games. All complete with original boxes.', 'Toys & Games', 'Very Good', 150.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['board-games', 'strategy', 'party', 'family'], NOW() - INTERVAL '17 days'),
    (demo_user_ids[7], 'VR Headset Bundle', 'Virtual reality headset with controllers and popular games. Immersive gaming experience for PC and console.', 'Electronics', 'Good', 280.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vr', 'virtual-reality', 'gaming', 'headset'], NOW() - INTERVAL '18 days'),
    
    (demo_user_ids[8], 'Herb Garden Starter Kit', 'Complete indoor herb garden with seeds, pots, and growing medium. Grow fresh herbs year-round in your kitchen.', 'Home & Garden', 'Like New', 45.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['herbs', 'garden', 'indoor', 'growing'], NOW() - INTERVAL '19 days'),
    (demo_user_ids[8], 'Plant Care Book Collection', 'Comprehensive collection of plant care books covering houseplants, gardening, and plant propagation techniques.', 'Books', 'Good', 60.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['plants', 'gardening', 'books', 'care'], NOW() - INTERVAL '20 days'),
    
    (demo_user_ids[9], 'Gourmet Spice Rack', 'Wooden spice rack with 30+ gourmet spices and seasonings. Perfect for elevating your cooking game.', 'Home & Garden', 'Like New', 85.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['spices', 'gourmet', 'cooking', 'kitchen'], NOW() - INTERVAL '21 days'),
    (demo_user_ids[9], 'Cookbook Collection', 'Collection of professional cookbooks covering various cuisines and techniques. Perfect for expanding culinary skills.', 'Books', 'Good', 90.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['cookbooks', 'cuisine', 'cooking', 'recipes'], NOW() - INTERVAL '22 days'),
    
    (demo_user_ids[10], 'Canvas and Paint Set', 'Professional canvas and acrylic paint set with brushes and palette. Everything needed for painting masterpieces.', 'Art & Crafts', 'Like New', 110.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['canvas', 'paint', 'acrylic', 'art'], NOW() - INTERVAL '23 days');
    
    RAISE NOTICE 'Added additional demo items. Total items now: %', (SELECT COUNT(*) FROM items WHERE user_id = ANY(demo_user_ids));
  END IF;
END $$;

-- Verify RLS policies allow reading demo items
-- The existing policy should allow authenticated users to read active items
-- Let's make sure all demo items are marked as active
UPDATE items SET is_active = true WHERE user_id IN (SELECT id FROM users WHERE is_demo = true);

-- Final verification
DO $$
BEGIN
  RAISE NOTICE 'Final verification:';
  RAISE NOTICE 'Total demo users: %', (SELECT COUNT(*) FROM users WHERE is_demo = true);
  RAISE NOTICE 'Total demo items: %', (SELECT COUNT(*) FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true));
  RAISE NOTICE 'Active demo items: %', (SELECT COUNT(*) FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true) AND is_active = true);
  RAISE NOTICE 'Demo items by category: %', (SELECT json_object_agg(category, count) FROM (SELECT category, COUNT(*) as count FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true) GROUP BY category) t);
END $$;