/*
  # Demo Data Migration - Marketplace Environment

  1. Schema Updates
    - Add demo flag and swipe tracking to users table
    - Add pricing to items table
    - Add super like functionality to matches
    - Create messages and swipes tables

  2. Demo Data
    - 20 demo users with realistic profiles
    - 50+ demo items across various categories
    - All marked as demo accounts

  3. Functions
    - Swipe limit management
    - Daily reset functionality
*/

-- First, add demo flag and swipe tracking to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_swipes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_swipe_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add pricing and super like functionality to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Add super like functionality to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_super_like BOOLEAN DEFAULT false;

-- Create messages table for chat functionality
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'template')),
  is_read BOOLEAN DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Messages policies
CREATE POLICY "Users can read messages from their matches"
  ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches 
      WHERE matches.id = messages.match_id 
      AND (matches.user_id_1 = auth.uid() OR matches.user_id_2 = auth.uid())
    )
  );

CREATE POLICY "Users can send messages to their matches"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM matches 
      WHERE matches.id = messages.match_id 
      AND (matches.user_id_1 = auth.uid() OR matches.user_id_2 = auth.uid())
      AND matches.status = 'accepted'
    )
  );

-- Create swipes table to track user swipes
CREATE TABLE IF NOT EXISTS swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('left', 'right', 'super')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own swipes"
  ON swipes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_user_date ON swipes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_item ON swipes(item_id);

-- Temporarily disable the foreign key constraint for demo data
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Insert demo users with proper UUIDs
DO $$
DECLARE
  user_01_id uuid := '11111111-1111-1111-1111-111111111111';
  user_02_id uuid := '22222222-2222-2222-2222-222222222222';
  user_03_id uuid := '33333333-3333-3333-3333-333333333333';
  user_04_id uuid := '44444444-4444-4444-4444-444444444444';
  user_05_id uuid := '55555555-5555-5555-5555-555555555555';
  user_06_id uuid := '66666666-6666-6666-6666-666666666666';
  user_07_id uuid := '77777777-7777-7777-7777-777777777777';
  user_08_id uuid := '88888888-8888-8888-8888-888888888888';
  user_09_id uuid := '99999999-9999-9999-9999-999999999999';
  user_10_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  user_11_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  user_12_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  user_13_id uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  user_14_id uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  user_15_id uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  user_16_id uuid := '10101010-1010-1010-1010-101010101010';
  user_17_id uuid := '20202020-2020-2020-2020-202020202020';
  user_18_id uuid := '30303030-3030-3030-3030-303030303030';
  user_19_id uuid := '40404040-4040-4040-4040-404040404040';
  user_20_id uuid := '50505050-5050-5050-5050-505050505050';
BEGIN
  -- Insert demo users
  INSERT INTO users (id, username, location, avatar_url, bio, is_demo, rating, total_ratings, latitude, longitude, created_at) VALUES
  (user_01_id, 'TechEnthusiast_Mike', 'Downtown Seattle, WA', 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Software engineer passionate about vintage electronics and modern gadgets. Love trading tech items and discovering unique finds. Always looking for rare gaming consoles and retro computers!', true, 4.8, 25, 47.6062, -122.3321, NOW() - INTERVAL '4 months'),
  
  (user_02_id, 'VintageVibes_Sarah', 'Capitol Hill, Seattle, WA', 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage fashion lover and sustainable living advocate. I collect and trade unique clothing pieces, vinyl records, and home decor. Believer in giving items a second life through thoughtful exchanges.', true, 4.9, 32, 47.6205, -122.3212, NOW() - INTERVAL '5 months'),
  
  (user_03_id, 'BookwormBen', 'Fremont, Seattle, WA', 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Literature professor and avid reader. My collection has grown beyond my shelves! Specializing in rare books, first editions, and academic texts. Always excited to trade with fellow book lovers.', true, 4.7, 18, 47.6513, -122.3493, NOW() - INTERVAL '3 months'),
  
  (user_04_id, 'CraftyChloe', 'Ballard, Seattle, WA', 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'DIY enthusiast and craft supply hoarder (in the best way!). I create handmade jewelry, pottery, and art pieces. Love trading materials, tools, and finished creations with other makers.', true, 4.6, 22, 47.6684, -122.3834, NOW() - INTERVAL '2 months'),
  
  (user_05_id, 'FitnessFreak_Alex', 'Queen Anne, Seattle, WA', 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Personal trainer and fitness equipment collector. Always upgrading my home gym setup and happy to trade equipment that others might need. Passionate about helping people achieve their fitness goals.', true, 4.5, 15, 47.6374, -122.3563, NOW() - INTERVAL '6 months'),
  
  (user_06_id, 'MusicMaven_Luna', 'Georgetown, Seattle, WA', 'https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Professional musician and instrument collector. I play multiple instruments and love trading gear, sheet music, and vintage equipment. Always looking for unique pieces with character and history.', true, 4.8, 28, 47.5412, -122.3234, NOW() - INTERVAL '4 months'),
  
  (user_07_id, 'GamerGuru_Tyler', 'Wallingford, Seattle, WA', 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Retro gaming enthusiast and collector. My passion is preserving gaming history through collecting and trading vintage consoles, games, and accessories. Love connecting with fellow gamers!', true, 4.9, 35, 47.6615, -122.3340, NOW() - INTERVAL '5 months'),
  
  (user_08_id, 'PlantParent_Emma', 'Greenwood, Seattle, WA', 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Urban gardener and plant propagation expert. I trade rare plants, gardening tools, and homemade plant care products. My apartment is a jungle and I love sharing the green love with others!', true, 4.7, 21, 47.6815, -122.3542, NOW() - INTERVAL '3 months'),
  
  (user_09_id, 'ChefCharlie', 'Magnolia, Seattle, WA', 'https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Professional chef and kitchen gadget enthusiast. I trade high-quality cookware, specialty ingredients, and kitchen tools. Love helping fellow food lovers upgrade their culinary game!', true, 4.6, 19, 47.6415, -122.3984, NOW() - INTERVAL '2 months'),
  
  (user_10_id, 'ArtisticAnna', 'Beacon Hill, Seattle, WA', 'https://images.pexels.com/photos/1181424/pexels-photo-1181424.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Visual artist and art supply collector. I work in multiple mediums and love trading materials, finished pieces, and art books. Passionate about supporting the local art community through exchanges.', true, 4.8, 26, 47.5739, -122.3089, NOW() - INTERVAL '4 months'),
  
  (user_11_id, 'OutdoorOliver', 'West Seattle, WA', 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Adventure seeker and outdoor gear enthusiast. I trade camping equipment, hiking gear, and outdoor clothing. Always planning the next adventure and happy to help others gear up for theirs!', true, 4.7, 23, 47.5868, -122.3860, NOW() - INTERVAL '5 months'),
  
  (user_12_id, 'FashionForward_Zoe', 'South Lake Union, Seattle, WA', 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Fashion designer and sustainable style advocate. I trade designer pieces, vintage finds, and handmade accessories. Believe fashion should be circular and accessible to everyone!', true, 4.9, 31, 47.6205, -122.3370, NOW() - INTERVAL '3 months'),
  
  (user_13_id, 'TechTinkerer_Sam', 'Eastlake, Seattle, WA', 'https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Electronics repair specialist and gadget modifier. I trade broken devices, spare parts, and refurbished electronics. Love giving old tech new life and teaching others repair skills.', true, 4.5, 17, 47.6417, -122.3238, NOW() - INTERVAL '6 months'),
  
  (user_14_id, 'HomeDesign_Maya', 'Phinney Ridge, Seattle, WA', 'https://images.pexels.com/photos/1181519/pexels-photo-1181519.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Interior designer and home decor enthusiast. I trade furniture, decorative items, and design books. Passionate about creating beautiful spaces and helping others transform their homes affordably.', true, 4.8, 29, 47.6735, -122.3493, NOW() - INTERVAL '4 months'),
  
  (user_15_id, 'CollectibleCarl', 'Ravenna, Seattle, WA', 'https://images.pexels.com/photos/1040881/pexels-photo-1040881.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage toy and collectible specialist. I trade action figures, trading cards, and rare collectibles. Been collecting for 20+ years and love sharing knowledge with fellow collectors.', true, 4.6, 20, 47.6759, -122.3075, NOW() - INTERVAL '2 months'),
  
  (user_16_id, 'WellnessWendy', 'Northgate, Seattle, WA', 'https://images.pexels.com/photos/1181717/pexels-photo-1181717.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Yoga instructor and wellness product enthusiast. I trade yoga equipment, essential oils, and wellness books. Passionate about holistic health and helping others on their wellness journey.', true, 4.7, 24, 47.7038, -122.3254, NOW() - INTERVAL '5 months'),
  
  (user_17_id, 'PetLover_Jake', 'Columbia City, Seattle, WA', 'https://images.pexels.com/photos/1043473/pexels-photo-1043473.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Veterinarian and pet supply trader. I trade pet accessories, toys, and care products. Love helping pet parents find quality items for their furry friends at affordable prices.', true, 4.8, 27, 47.5591, -122.2927, NOW() - INTERVAL '3 months'),
  
  (user_18_id, 'CoffeeCrafter_Mia', 'Delridge, Seattle, WA', 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Barista and coffee equipment collector. I trade espresso machines, grinders, and specialty coffee accessories. Passionate about the perfect cup and helping others elevate their coffee game.', true, 4.9, 33, 47.5631, -122.3618, NOW() - INTERVAL '4 months'),
  
  (user_19_id, 'RetroRider_Max', 'Highland Park, Seattle, WA', 'https://images.pexels.com/photos/1040882/pexels-photo-1040882.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage bicycle enthusiast and bike mechanic. I trade classic bikes, parts, and cycling accessories. Love restoring old bikes to their former glory and getting people back on two wheels.', true, 4.6, 16, 47.5324, -122.3187, NOW() - INTERVAL '6 months'),
  
  (user_20_id, 'StudyBuddy_Lily', 'University District, Seattle, WA', 'https://images.pexels.com/photos/1181424/pexels-photo-1181424.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Graduate student and academic resource trader. I trade textbooks, study materials, and educational tools. Believe knowledge should be accessible and affordable for all students!', true, 4.7, 22, 47.6587, -122.3138, NOW() - INTERVAL '2 months');

  -- Insert demo items (5-10 per user)
  INSERT INTO items (user_id, title, description, category, condition, price, image_url, tags, created_at) VALUES
  -- TechEnthusiast_Mike's items
  (user_01_id, 'Vintage Apple IIe Computer', 'Fully functional Apple IIe from 1983 with original monitor, keyboard, and disk drives. Includes original manuals and software collection. Perfect for retro computing enthusiasts!', 'Electronics', 'Very Good', 450.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', 'apple', 'computer', 'retro'], NOW() - INTERVAL '2 weeks'),
  (user_01_id, 'Nintendo Game Boy Color Bundle', 'Transparent purple Game Boy Color with 15 games including Pokemon Gold, Zelda, and Mario titles. All games tested and working perfectly.', 'Electronics', 'Good', 180.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['nintendo', 'gameboy', 'pokemon', 'gaming'], NOW() - INTERVAL '1 week'),
  (user_01_id, 'Mechanical Keyboard Collection', 'Set of 3 vintage mechanical keyboards: IBM Model M, Cherry MX Blue custom, and rare Alps switch board. Perfect for enthusiasts or daily use.', 'Electronics', 'Very Good', 320.00, 'https://images.pexels.com/photos/1772123/pexels-photo-1772123.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['keyboard', 'mechanical', 'vintage', 'IBM'], NOW() - INTERVAL '5 days'),
  (user_01_id, 'Raspberry Pi Starter Kit', 'Complete Raspberry Pi 4 kit with case, power supply, SD card, and sensor modules. Great for learning programming and electronics projects.', 'Electronics', 'Like New', 95.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['raspberry-pi', 'programming', 'electronics', 'learning'], NOW() - INTERVAL '3 days'),
  (user_01_id, 'Vintage Walkman Collection', 'Three classic Sony Walkmans from the 80s and 90s. All serviced and working. Includes original headphones and carrying cases.', 'Electronics', 'Good', 150.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['walkman', 'sony', 'vintage', 'music'], NOW() - INTERVAL '10 days'),

  -- VintageVibes_Sarah's items
  (user_02_id, '1960s Mod Dress Collection', 'Authentic 1960s mod dresses in excellent condition. Sizes 6-10. Includes iconic patterns and colors from the era. Perfect for vintage fashion lovers!', 'Clothing', 'Very Good', 280.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', '1960s', 'mod', 'dress'], NOW() - INTERVAL '1 week'),
  (user_02_id, 'Vinyl Record Collection - Jazz', '50+ jazz vinyl records from the 1950s-70s. Includes Miles Davis, John Coltrane, and other legends. Most in VG+ condition.', 'Music & Instruments', 'Good', 350.00, 'https://images.pexels.com/photos/1389429/pexels-photo-1389429.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vinyl', 'jazz', 'records', 'vintage'], NOW() - INTERVAL '4 days'),
  (user_02_id, 'Mid-Century Modern Lamp', 'Authentic 1950s atomic-style table lamp with original shade. Rewired for safety. A true statement piece for any mid-century modern home.', 'Home & Garden', 'Very Good', 125.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['mid-century', 'lamp', 'atomic', 'vintage'], NOW() - INTERVAL '6 days'),
  (user_02_id, 'Vintage Leather Handbag Set', 'Three genuine leather handbags from the 1970s-80s. All in excellent condition with original hardware. Timeless styles that never go out of fashion.', 'Clothing', 'Very Good', 90.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['leather', 'handbag', 'vintage', '1970s'], NOW() - INTERVAL '2 days'),
  (user_02_id, 'Retro Kitchen Appliance Set', 'Matching set of 1950s-style kitchen appliances: toaster, mixer, and blender. All fully functional and beautifully maintained.', 'Home & Garden', 'Good', 200.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['kitchen', 'appliances', 'retro', '1950s'], NOW() - INTERVAL '8 days'),

  -- BookwormBen's items
  (user_03_id, 'First Edition Tolkien Set', 'Complete first edition set of The Lord of the Rings trilogy with dust jackets. Excellent condition, stored in protective sleeves. A treasure for any collector.', 'Books', 'Very Good', 500.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['tolkien', 'first-edition', 'fantasy', 'collectible'], NOW() - INTERVAL '3 weeks'),
  (user_03_id, 'Philosophy Textbook Collection', '25+ philosophy textbooks covering ancient to modern philosophy. Perfect for students or anyone interested in philosophical thought.', 'Books', 'Good', 180.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['philosophy', 'textbooks', 'education', 'academic'], NOW() - INTERVAL '1 week'),
  (user_03_id, 'Rare Poetry Collection', 'Collection of signed poetry books including works by contemporary and classic poets. Some limited editions included.', 'Books', 'Very Good', 220.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['poetry', 'signed', 'limited-edition', 'literature'], NOW() - INTERVAL '5 days'),
  (user_03_id, 'Science Fiction Paperback Lot', '100+ vintage science fiction paperbacks from the 1960s-80s. Includes Asimov, Herbert, Dick, and other masters of the genre.', 'Books', 'Good', 150.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sci-fi', 'paperback', 'vintage', 'asimov'], NOW() - INTERVAL '2 days'),
  (user_03_id, 'Antique Book Binding Tools', 'Complete set of traditional bookbinding tools and materials. Perfect for book restoration or creating handmade books.', 'Tools & Equipment', 'Good', 85.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['bookbinding', 'tools', 'restoration', 'crafts'], NOW() - INTERVAL '9 days'),

  -- CraftyChloe's items
  (user_04_id, 'Professional Pottery Wheel', 'Shimpo VL-Lite pottery wheel in excellent condition. Perfect for intermediate to advanced potters. Includes foot pedal and splash pan.', 'Art & Crafts', 'Very Good', 380.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['pottery', 'wheel', 'ceramics', 'professional'], NOW() - INTERVAL '2 weeks'),
  (user_04_id, 'Jewelry Making Supplies Kit', 'Comprehensive jewelry making kit with beads, wire, tools, and findings. Enough supplies to create dozens of unique pieces.', 'Art & Crafts', 'Like New', 120.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['jewelry', 'beads', 'crafts', 'supplies'], NOW() - INTERVAL '1 week'),
  (user_04_id, 'Vintage Sewing Machine', 'Beautiful 1960s Singer sewing machine in working condition. Comes with original case and accessories. Perfect for quilting and garment making.', 'Art & Crafts', 'Good', 160.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sewing', 'singer', 'vintage', 'quilting'], NOW() - INTERVAL '4 days'),
  (user_04_id, 'Handmade Ceramic Bowl Set', 'Set of 6 handmade ceramic bowls with unique glazes. Food safe and dishwasher safe. Each piece is one-of-a-kind.', 'Art & Crafts', 'Like New', 75.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['ceramic', 'handmade', 'bowls', 'pottery'], NOW() - INTERVAL '3 days'),
  (user_04_id, 'Fabric Scrap Collection', 'Large collection of high-quality fabric scraps perfect for quilting, crafts, or small sewing projects. Includes cotton, silk, and wool.', 'Art & Crafts', 'Good', 45.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['fabric', 'quilting', 'scraps', 'sewing'], NOW() - INTERVAL '6 days'),

  -- FitnessFreak_Alex's items
  (user_05_id, 'Olympic Weight Set', 'Complete Olympic weight set with barbell and 300lbs of plates. All equipment in excellent condition. Perfect for serious home gym setup.', 'Sports & Outdoors', 'Very Good', 420.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['weights', 'olympic', 'barbell', 'gym'], NOW() - INTERVAL '2 weeks'),
  (user_05_id, 'Adjustable Dumbbells', 'PowerBlock adjustable dumbbells, 5-50lbs per hand. Space-saving design perfect for home workouts. Includes stand.', 'Sports & Outdoors', 'Good', 280.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['dumbbells', 'adjustable', 'powerblock', 'home-gym'], NOW() - INTERVAL '1 week'),
  (user_05_id, 'Yoga Mat Collection', 'Set of 5 premium yoga mats in different thicknesses and materials. Perfect for yoga studio or personal practice.', 'Sports & Outdoors', 'Like New', 90.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['yoga', 'mats', 'fitness', 'meditation'], NOW() - INTERVAL '5 days'),
  (user_05_id, 'Resistance Band Set', 'Professional resistance band set with door anchor, handles, and ankle straps. Perfect for travel workouts or home training.', 'Sports & Outdoors', 'Like New', 35.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['resistance', 'bands', 'portable', 'workout'], NOW() - INTERVAL '3 days'),
  (user_05_id, 'Foam Roller and Recovery Kit', 'Complete recovery kit with foam rollers, massage balls, and stretching straps. Essential for post-workout recovery.', 'Sports & Outdoors', 'Good', 65.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['recovery', 'foam-roller', 'massage', 'stretching'], NOW() - INTERVAL '7 days'),

  -- MusicMaven_Luna's items
  (user_06_id, 'Vintage Fender Stratocaster', '1970s Fender Stratocaster in sunburst finish. Original pickups and hardware. Some wear but plays beautifully. A true classic!', 'Music & Instruments', 'Good', 480.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['fender', 'stratocaster', 'guitar', 'vintage'], NOW() - INTERVAL '2 weeks'),
  (user_06_id, 'Professional Microphone Set', 'Shure SM57 and SM58 microphone pair with stands and cables. Industry standard mics perfect for recording or live performance.', 'Music & Instruments', 'Very Good', 220.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['microphone', 'shure', 'recording', 'professional'], NOW() - INTERVAL '1 week'),
  (user_06_id, 'Vintage Piano Sheet Music', 'Collection of 200+ vintage piano sheet music pieces from 1920s-1960s. Includes classical, jazz, and popular songs of the era.', 'Music & Instruments', 'Good', 85.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sheet-music', 'piano', 'vintage', 'classical'], NOW() - INTERVAL '5 days'),
  (user_06_id, 'Electric Keyboard with Stand', 'Yamaha PSR-E373 keyboard with stand, sustain pedal, and music rest. Perfect for beginners or experienced players.', 'Music & Instruments', 'Like New', 180.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['keyboard', 'yamaha', 'electric', 'beginner'], NOW() - INTERVAL '3 days'),

  -- GamerGuru_Tyler's items
  (user_07_id, 'Nintendo 64 Complete Collection', 'Nintendo 64 console with 4 controllers and 25 games including GoldenEye, Mario Kart, and Zelda. All tested and working perfectly.', 'Electronics', 'Very Good', 350.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['nintendo64', 'retro', 'gaming', 'complete'], NOW() - INTERVAL '10 days'),
  (user_07_id, 'Arcade Cabinet Kit', 'DIY arcade cabinet kit with all hardware and instructions. Perfect project for retro gaming enthusiasts. Raspberry Pi compatible.', 'Electronics', 'Like New', 180.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['arcade', 'diy', 'cabinet', 'retro'], NOW() - INTERVAL '5 days'),
  (user_07_id, 'Gaming Chair Pro', 'High-end gaming chair with lumbar support, adjustable armrests, and RGB lighting. Barely used, like new condition.', 'Electronics', 'Like New', 250.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['gaming', 'chair', 'rgb', 'ergonomic'], NOW() - INTERVAL '1 week'),
  (user_07_id, 'Retro Game Collection', '50+ classic games for various consoles: NES, SNES, Genesis, PlayStation. All cartridges/discs tested and working.', 'Electronics', 'Good', 300.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['retro', 'games', 'collection', 'classic'], NOW() - INTERVAL '2 days'),

  -- PlantParent_Emma's items
  (user_08_id, 'Rare Monstera Variegata', 'Beautiful variegated Monstera deliciosa cutting with established roots. Stunning white and green variegation. Very rare find!', 'Home & Garden', 'Like New', 150.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['monstera', 'variegated', 'rare', 'houseplant'], NOW() - INTERVAL '3 days'),
  (user_08_id, 'Hydroponic Growing System', 'Complete hydroponic system for growing herbs and vegetables indoors. Includes LED grow lights and nutrient solutions.', 'Home & Garden', 'Good', 120.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['hydroponic', 'growing', 'indoor', 'herbs'], NOW() - INTERVAL '1 week'),
  (user_08_id, 'Plant Propagation Station', 'Beautiful wooden propagation station with glass tubes. Perfect for rooting cuttings and displaying growing plants.', 'Home & Garden', 'Like New', 45.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['propagation', 'wooden', 'cuttings', 'display'], NOW() - INTERVAL '6 days'),
  (user_08_id, 'Succulent Collection', 'Collection of 20+ different succulent varieties in decorative pots. Perfect for beginners or adding to existing collections.', 'Home & Garden', 'Very Good', 80.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['succulents', 'collection', 'pots', 'beginner'], NOW() - INTERVAL '4 days'),
  (user_08_id, 'Garden Tool Set', 'Professional garden tool set with hand tools, watering can, and plant care accessories. All tools in excellent condition.', 'Home & Garden', 'Very Good', 65.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['garden', 'tools', 'professional', 'care'], NOW() - INTERVAL '8 days'),

  -- ChefCharlie's items
  (user_09_id, 'Professional Knife Set', 'Wusthof Classic 8-piece knife set with wooden block. Barely used, professionally sharpened. Perfect for serious home cooks.', 'Home & Garden', 'Like New', 280.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['knives', 'wusthof', 'professional', 'cooking'], NOW() - INTERVAL '1 week'),
  (user_09_id, 'Stand Mixer with Attachments', 'KitchenAid Artisan stand mixer in red with pasta, meat grinder, and ice cream attachments. Excellent condition.', 'Home & Garden', 'Very Good', 320.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['kitchenaid', 'mixer', 'attachments', 'baking'], NOW() - INTERVAL '4 days'),
  (user_09_id, 'Cast Iron Cookware Set', 'Lodge cast iron set: skillet, Dutch oven, and griddle. All pre-seasoned and ready to use. Perfect for any cooking style.', 'Home & Garden', 'Good', 150.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['cast-iron', 'lodge', 'cookware', 'seasoned'], NOW() - INTERVAL '2 days'),
  (user_09_id, 'Specialty Spice Collection', 'Collection of 50+ specialty spices and seasonings from around the world. All sealed and fresh. Perfect for adventurous cooks.', 'Home & Garden', 'Like New', 75.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['spices', 'international', 'cooking', 'specialty'], NOW() - INTERVAL '5 days'),

  -- ArtisticAnna's items
  (user_10_id, 'Professional Art Supply Set', 'Complete professional art set with oil paints, brushes, canvases, and easel. Everything needed to start creating masterpieces.', 'Art & Crafts', 'Very Good', 200.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['art', 'supplies', 'oil-paints', 'professional'], NOW() - INTERVAL '2 weeks'),
  (user_10_id, 'Vintage Art Books Collection', 'Collection of 30+ art books covering various movements, techniques, and famous artists. Perfect for students and enthusiasts.', 'Books', 'Good', 120.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['art', 'books', 'education', 'techniques'], NOW() - INTERVAL '1 week'),
  (user_10_id, 'Handmade Pottery Collection', 'Collection of handmade pottery pieces: vases, bowls, and decorative items. Each piece is unique and food-safe.', 'Art & Crafts', 'Like New', 90.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['pottery', 'handmade', 'unique', 'decorative'], NOW() - INTERVAL '3 days'),
  (user_10_id, 'Digital Drawing Tablet', 'Wacom Intuos Pro drawing tablet with pressure-sensitive pen. Perfect for digital artists and designers.', 'Electronics', 'Very Good', 180.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['wacom', 'tablet', 'digital', 'drawing'], NOW() - INTERVAL '6 days'),

  -- OutdoorOliver's items
  (user_11_id, 'Camping Gear Bundle', 'Complete camping setup: 4-person tent, sleeping bags, camp stove, and cookware. Perfect for family camping adventures.', 'Sports & Outdoors', 'Good', 250.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['camping', 'tent', 'outdoor', 'family'], NOW() - INTERVAL '2 weeks'),
  (user_11_id, 'Hiking Backpack Pro', 'Osprey 65L hiking backpack with rain cover and hydration system. Barely used, perfect for multi-day hikes.', 'Sports & Outdoors', 'Like New', 180.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['hiking', 'backpack', 'osprey', 'outdoor'], NOW() - INTERVAL '1 week'),
  (user_11_id, 'Rock Climbing Gear Set', 'Complete climbing gear: harness, helmet, shoes, and hardware. All gear inspected and certified safe.', 'Sports & Outdoors', 'Very Good', 320.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['climbing', 'gear', 'safety', 'certified'], NOW() - INTERVAL '5 days'),

  -- FashionForward_Zoe's items
  (user_12_id, 'Designer Handbag Collection', 'Authentic designer handbags from Coach, Kate Spade, and Michael Kors. All in excellent condition with authenticity cards.', 'Clothing', 'Very Good', 400.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['designer', 'handbag', 'authentic', 'luxury'], NOW() - INTERVAL '1 week'),
  (user_12_id, 'Sustainable Fashion Bundle', 'Collection of eco-friendly clothing from sustainable brands. Sizes S-M. Perfect for conscious fashion lovers.', 'Clothing', 'Like New', 150.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sustainable', 'eco-friendly', 'fashion', 'conscious'], NOW() - INTERVAL '3 days'),
  (user_12_id, 'Vintage Jewelry Collection', 'Curated collection of vintage jewelry pieces from the 1960s-80s. All pieces authenticated and in excellent condition.', 'Clothing', 'Very Good', 220.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', 'jewelry', 'authenticated', 'collection'], NOW() - INTERVAL '6 days'),

  -- TechTinkerer_Sam's items
  (user_13_id, 'Electronics Repair Kit', 'Professional electronics repair kit with soldering station, multimeter, and precision tools. Perfect for hobbyists and professionals.', 'Tools & Equipment', 'Very Good', 180.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['repair', 'electronics', 'soldering', 'professional'], NOW() - INTERVAL '2 weeks'),
  (user_13_id, 'Refurbished Laptop Collection', 'Collection of refurbished laptops: ThinkPads and MacBooks. All tested and upgraded with SSDs.', 'Electronics', 'Good', 350.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['laptop', 'refurbished', 'thinkpad', 'macbook'], NOW() - INTERVAL '1 week'),
  (user_13_id, 'Arduino Starter Mega Kit', 'Complete Arduino mega kit with sensors, motors, and components. Perfect for learning electronics and programming.', 'Electronics', 'Like New', 95.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['arduino', 'electronics', 'programming', 'learning'], NOW() - INTERVAL '4 days'),

  -- HomeDesign_Maya's items
  (user_14_id, 'Mid-Century Furniture Set', 'Authentic mid-century modern furniture: coffee table, side chairs, and lamp. All pieces restored to original condition.', 'Home & Garden', 'Very Good', 450.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['mid-century', 'furniture', 'authentic', 'restored'], NOW() - INTERVAL '3 weeks'),
  (user_14_id, 'Interior Design Book Collection', 'Professional interior design books covering color theory, space planning, and contemporary trends. Perfect for students and professionals.', 'Books', 'Good', 120.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['interior-design', 'books', 'professional', 'education'], NOW() - INTERVAL '1 week'),
  (user_14_id, 'Decorative Art Collection', 'Curated collection of wall art, sculptures, and decorative objects. Perfect for styling any modern home.', 'Home & Garden', 'Like New', 180.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['art', 'decorative', 'modern', 'styling'], NOW() - INTERVAL '5 days'),

  -- CollectibleCarl's items
  (user_15_id, 'Vintage Action Figure Collection', 'Rare vintage action figures from the 80s and 90s: G.I. Joe, Transformers, and Star Wars. All in original packaging.', 'Collectibles', 'Very Good', 380.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['action-figures', 'vintage', 'collectible', 'original-packaging'], NOW() - INTERVAL '2 weeks'),
  (user_15_id, 'Trading Card Collection', 'Extensive trading card collection: Pokemon, Magic, and sports cards. Includes rare and holographic cards.', 'Collectibles', 'Good', 250.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['trading-cards', 'pokemon', 'magic', 'rare'], NOW() - INTERVAL '1 week'),
  (user_15_id, 'Comic Book Collection', 'Collection of vintage comic books from the 70s-90s. Includes Marvel and DC titles in protective sleeves.', 'Books', 'Good', 200.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['comic-books', 'vintage', 'marvel', 'dc'], NOW() - INTERVAL '3 days');

END $$;

-- Re-add the foreign key constraint for future real users
-- Note: This will only affect new inserts, existing demo data will remain
ALTER TABLE users ADD CONSTRAINT users_id_fkey 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Function to reset daily swipe count
CREATE OR REPLACE FUNCTION reset_daily_swipes()
RETURNS void AS $$
BEGIN
  UPDATE users 
  SET daily_swipes = 0, last_swipe_date = CURRENT_DATE
  WHERE last_swipe_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to check swipe limit
CREATE OR REPLACE FUNCTION can_user_swipe(user_uuid UUID)
RETURNS boolean AS $$
DECLARE
  user_swipes INTEGER;
  user_last_swipe DATE;
BEGIN
  SELECT daily_swipes, last_swipe_date 
  INTO user_swipes, user_last_swipe
  FROM users 
  WHERE id = user_uuid;
  
  -- Reset if new day
  IF user_last_swipe < CURRENT_DATE THEN
    UPDATE users 
    SET daily_swipes = 0, last_swipe_date = CURRENT_DATE
    WHERE id = user_uuid;
    RETURN true;
  END IF;
  
  -- Check limit (50 swipes per day)
  RETURN user_swipes < 50;
END;
$$ LANGUAGE plpgsql;

-- Function to increment swipe count
CREATE OR REPLACE FUNCTION increment_swipe_count(user_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE users 
  SET daily_swipes = daily_swipes + 1
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up demo data (for development purposes)
CREATE OR REPLACE FUNCTION cleanup_demo_data()
RETURNS void AS $$
BEGIN
  DELETE FROM items WHERE user_id IN (SELECT id FROM users WHERE is_demo = true);
  DELETE FROM users WHERE is_demo = true;
END;
$$ LANGUAGE plpgsql;