/*
  # Create Demo Data for Marketplace

  1. Demo Users
    - 20 distinct user profiles with realistic data
    - Varied locations within 25-mile radius
    - Different activity levels and join dates

  2. Demo Items
    - 5-10 items per user (100+ total items)
    - Realistic descriptions and pricing
    - Various categories and conditions

  3. Enhanced Features
    - Swipe tracking and limits
    - Super likes functionality
    - Messaging system
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

-- Insert demo users
INSERT INTO users (id, username, location, avatar_url, bio, is_demo, rating, total_ratings, latitude, longitude, created_at) VALUES
('demo-user-01', 'TechEnthusiast_Mike', 'Downtown Seattle, WA', 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Software engineer passionate about vintage electronics and modern gadgets. Love trading tech items and discovering unique finds. Always looking for rare gaming consoles and retro computers!', true, 4.8, 25, 47.6062, -122.3321, NOW() - INTERVAL '4 months'),

('demo-user-02', 'VintageVibes_Sarah', 'Capitol Hill, Seattle, WA', 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage fashion lover and sustainable living advocate. I collect and trade unique clothing pieces, vinyl records, and home decor. Believer in giving items a second life through thoughtful exchanges.', true, 4.9, 32, 47.6205, -122.3212, NOW() - INTERVAL '5 months'),

('demo-user-03', 'BookwormBen', 'Fremont, Seattle, WA', 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Literature professor and avid reader. My collection has grown beyond my shelves! Specializing in rare books, first editions, and academic texts. Always excited to trade with fellow book lovers.', true, 4.7, 18, 47.6513, -122.3493, NOW() - INTERVAL '3 months'),

('demo-user-04', 'CraftyChloe', 'Ballard, Seattle, WA', 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'DIY enthusiast and craft supply hoarder (in the best way!). I create handmade jewelry, pottery, and art pieces. Love trading materials, tools, and finished creations with other makers.', true, 4.6, 22, 47.6684, -122.3834, NOW() - INTERVAL '2 months'),

('demo-user-05', 'FitnessFreak_Alex', 'Queen Anne, Seattle, WA', 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Personal trainer and fitness equipment collector. Always upgrading my home gym setup and happy to trade equipment that others might need. Passionate about helping people achieve their fitness goals.', true, 4.5, 15, 47.6374, -122.3563, NOW() - INTERVAL '6 months'),

('demo-user-06', 'MusicMaven_Luna', 'Georgetown, Seattle, WA', 'https://images.pexels.com/photos/1065084/pexels-photo-1065084.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Professional musician and instrument collector. I play multiple instruments and love trading gear, sheet music, and vintage equipment. Always looking for unique pieces with character and history.', true, 4.8, 28, 47.5412, -122.3234, NOW() - INTERVAL '4 months'),

('demo-user-07', 'GamerGuru_Tyler', 'Wallingford, Seattle, WA', 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Retro gaming enthusiast and collector. My passion is preserving gaming history through collecting and trading vintage consoles, games, and accessories. Love connecting with fellow gamers!', true, 4.9, 35, 47.6615, -122.3340, NOW() - INTERVAL '5 months'),

('demo-user-08', 'PlantParent_Emma', 'Greenwood, Seattle, WA', 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Urban gardener and plant propagation expert. I trade rare plants, gardening tools, and homemade plant care products. My apartment is a jungle and I love sharing the green love with others!', true, 4.7, 21, 47.6815, -122.3542, NOW() - INTERVAL '3 months'),

('demo-user-09', 'ChefCharlie', 'Magnolia, Seattle, WA', 'https://images.pexels.com/photos/1139743/pexels-photo-1139743.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Professional chef and kitchen gadget enthusiast. I trade high-quality cookware, specialty ingredients, and kitchen tools. Love helping fellow food lovers upgrade their culinary game!', true, 4.6, 19, 47.6415, -122.3984, NOW() - INTERVAL '2 months'),

('demo-user-10', 'ArtisticAnna', 'Beacon Hill, Seattle, WA', 'https://images.pexels.com/photos/1181424/pexels-photo-1181424.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Visual artist and art supply collector. I work in multiple mediums and love trading materials, finished pieces, and art books. Passionate about supporting the local art community through exchanges.', true, 4.8, 26, 47.5739, -122.3089, NOW() - INTERVAL '4 months'),

('demo-user-11', 'OutdoorOliver', 'West Seattle, WA', 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Adventure seeker and outdoor gear enthusiast. I trade camping equipment, hiking gear, and outdoor clothing. Always planning the next adventure and happy to help others gear up for theirs!', true, 4.7, 23, 47.5868, -122.3860, NOW() - INTERVAL '5 months'),

('demo-user-12', 'FashionForward_Zoe', 'South Lake Union, Seattle, WA', 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Fashion designer and sustainable style advocate. I trade designer pieces, vintage finds, and handmade accessories. Believe fashion should be circular and accessible to everyone!', true, 4.9, 31, 47.6205, -122.3370, NOW() - INTERVAL '3 months'),

('demo-user-13', 'TechTinkerer_Sam', 'Eastlake, Seattle, WA', 'https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Electronics repair specialist and gadget modifier. I trade broken devices, spare parts, and refurbished electronics. Love giving old tech new life and teaching others repair skills.', true, 4.5, 17, 47.6417, -122.3238, NOW() - INTERVAL '6 months'),

('demo-user-14', 'HomeDesign_Maya', 'Phinney Ridge, Seattle, WA', 'https://images.pexels.com/photos/1181519/pexels-photo-1181519.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Interior designer and home decor enthusiast. I trade furniture, decorative items, and design books. Passionate about creating beautiful spaces and helping others transform their homes affordably.', true, 4.8, 29, 47.6735, -122.3493, NOW() - INTERVAL '4 months'),

('demo-user-15', 'CollectibleCarl', 'Ravenna, Seattle, WA', 'https://images.pexels.com/photos/1040881/pexels-photo-1040881.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage toy and collectible specialist. I trade action figures, trading cards, and rare collectibles. Been collecting for 20+ years and love sharing knowledge with fellow collectors.', true, 4.6, 20, 47.6759, -122.3075, NOW() - INTERVAL '2 months'),

('demo-user-16', 'WellnessWendy', 'Northgate, Seattle, WA', 'https://images.pexels.com/photos/1181717/pexels-photo-1181717.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Yoga instructor and wellness product enthusiast. I trade yoga equipment, essential oils, and wellness books. Passionate about holistic health and helping others on their wellness journey.', true, 4.7, 24, 47.7038, -122.3254, NOW() - INTERVAL '5 months'),

('demo-user-17', 'PetLover_Jake', 'Columbia City, Seattle, WA', 'https://images.pexels.com/photos/1043473/pexels-photo-1043473.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Veterinarian and pet supply trader. I trade pet accessories, toys, and care products. Love helping pet parents find quality items for their furry friends at affordable prices.', true, 4.8, 27, 47.5591, -122.2927, NOW() - INTERVAL '3 months'),

('demo-user-18', 'CoffeeCrafter_Mia', 'Delridge, Seattle, WA', 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Barista and coffee equipment collector. I trade espresso machines, grinders, and specialty coffee accessories. Passionate about the perfect cup and helping others elevate their coffee game.', true, 4.9, 33, 47.5631, -122.3618, NOW() - INTERVAL '4 months'),

('demo-user-19', 'RetroRider_Max', 'Highland Park, Seattle, WA', 'https://images.pexels.com/photos/1040882/pexels-photo-1040882.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Vintage bicycle enthusiast and bike mechanic. I trade classic bikes, parts, and cycling accessories. Love restoring old bikes to their former glory and getting people back on two wheels.', true, 4.6, 16, 47.5324, -122.3187, NOW() - INTERVAL '6 months'),

('demo-user-20', 'StudyBuddy_Lily', 'University District, Seattle, WA', 'https://images.pexels.com/photos/1181424/pexels-photo-1181424.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', 'Graduate student and academic resource trader. I trade textbooks, study materials, and educational tools. Believe knowledge should be accessible and affordable for all students!', true, 4.7, 22, 47.6587, -122.3138, NOW() - INTERVAL '2 months');

-- Insert demo items (5-10 per user)
INSERT INTO items (user_id, title, description, category, condition, price, image_url, tags, created_at) VALUES
-- TechEnthusiast_Mike's items
('demo-user-01', 'Vintage Apple IIe Computer', 'Fully functional Apple IIe from 1983 with original monitor, keyboard, and disk drives. Includes original manuals and software collection. Perfect for retro computing enthusiasts!', 'Electronics', 'Very Good', 450.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', 'apple', 'computer', 'retro'], NOW() - INTERVAL '2 weeks'),
('demo-user-01', 'Nintendo Game Boy Color Bundle', 'Transparent purple Game Boy Color with 15 games including Pokemon Gold, Zelda, and Mario titles. All games tested and working perfectly.', 'Electronics', 'Good', 180.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['nintendo', 'gameboy', 'pokemon', 'gaming'], NOW() - INTERVAL '1 week'),
('demo-user-01', 'Mechanical Keyboard Collection', 'Set of 3 vintage mechanical keyboards: IBM Model M, Cherry MX Blue custom, and rare Alps switch board. Perfect for enthusiasts or daily use.', 'Electronics', 'Very Good', 320.00, 'https://images.pexels.com/photos/1772123/pexels-photo-1772123.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['keyboard', 'mechanical', 'vintage', 'IBM'], NOW() - INTERVAL '5 days'),
('demo-user-01', 'Raspberry Pi Starter Kit', 'Complete Raspberry Pi 4 kit with case, power supply, SD card, and sensor modules. Great for learning programming and electronics projects.', 'Electronics', 'Like New', 95.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['raspberry-pi', 'programming', 'electronics', 'learning'], NOW() - INTERVAL '3 days'),
('demo-user-01', 'Vintage Walkman Collection', 'Three classic Sony Walkmans from the 80s and 90s. All serviced and working. Includes original headphones and carrying cases.', 'Electronics', 'Good', 150.00, 'https://images.pexels.com/photos/1714208/pexels-photo-1714208.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['walkman', 'sony', 'vintage', 'music'], NOW() - INTERVAL '10 days'),

-- VintageVibes_Sarah's items
('demo-user-02', '1960s Mod Dress Collection', 'Authentic 1960s mod dresses in excellent condition. Sizes 6-10. Includes iconic patterns and colors from the era. Perfect for vintage fashion lovers!', 'Clothing', 'Very Good', 280.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vintage', '1960s', 'mod', 'dress'], NOW() - INTERVAL '1 week'),
('demo-user-02', 'Vinyl Record Collection - Jazz', '50+ jazz vinyl records from the 1950s-70s. Includes Miles Davis, John Coltrane, and other legends. Most in VG+ condition.', 'Music & Instruments', 'Good', 350.00, 'https://images.pexels.com/photos/1389429/pexels-photo-1389429.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['vinyl', 'jazz', 'records', 'vintage'], NOW() - INTERVAL '4 days'),
('demo-user-02', 'Mid-Century Modern Lamp', 'Authentic 1950s atomic-style table lamp with original shade. Rewired for safety. A true statement piece for any mid-century modern home.', 'Home & Garden', 'Very Good', 125.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['mid-century', 'lamp', 'atomic', 'vintage'], NOW() - INTERVAL '6 days'),
('demo-user-02', 'Vintage Leather Handbag Set', 'Three genuine leather handbags from the 1970s-80s. All in excellent condition with original hardware. Timeless styles that never go out of fashion.', 'Clothing', 'Very Good', 90.00, 'https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['leather', 'handbag', 'vintage', '1970s'], NOW() - INTERVAL '2 days'),
('demo-user-02', 'Retro Kitchen Appliance Set', 'Matching set of 1950s-style kitchen appliances: toaster, mixer, and blender. All fully functional and beautifully maintained.', 'Home & Garden', 'Good', 200.00, 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['kitchen', 'appliances', 'retro', '1950s'], NOW() - INTERVAL '8 days'),

-- BookwormBen's items
('demo-user-03', 'First Edition Tolkien Set', 'Complete first edition set of The Lord of the Rings trilogy with dust jackets. Excellent condition, stored in protective sleeves. A treasure for any collector.', 'Books', 'Very Good', 500.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['tolkien', 'first-edition', 'fantasy', 'collectible'], NOW() - INTERVAL '3 weeks'),
('demo-user-03', 'Philosophy Textbook Collection', '25+ philosophy textbooks covering ancient to modern philosophy. Perfect for students or anyone interested in philosophical thought.', 'Books', 'Good', 180.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['philosophy', 'textbooks', 'education', 'academic'], NOW() - INTERVAL '1 week'),
('demo-user-03', 'Rare Poetry Collection', 'Collection of signed poetry books including works by contemporary and classic poets. Some limited editions included.', 'Books', 'Very Good', 220.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['poetry', 'signed', 'limited-edition', 'literature'], NOW() - INTERVAL '5 days'),
('demo-user-03', 'Science Fiction Paperback Lot', '100+ vintage science fiction paperbacks from the 1960s-80s. Includes Asimov, Herbert, Dick, and other masters of the genre.', 'Books', 'Good', 150.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sci-fi', 'paperback', 'vintage', 'asimov'], NOW() - INTERVAL '2 days'),
('demo-user-03', 'Antique Book Binding Tools', 'Complete set of traditional bookbinding tools and materials. Perfect for book restoration or creating handmade books.', 'Tools & Equipment', 'Good', 85.00, 'https://images.pexels.com/photos/1029141/pexels-photo-1029141.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['bookbinding', 'tools', 'restoration', 'crafts'], NOW() - INTERVAL '9 days'),

-- CraftyChloe's items
('demo-user-04', 'Professional Pottery Wheel', 'Shimpo VL-Lite pottery wheel in excellent condition. Perfect for intermediate to advanced potters. Includes foot pedal and splash pan.', 'Art & Crafts', 'Very Good', 380.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['pottery', 'wheel', 'ceramics', 'professional'], NOW() - INTERVAL '2 weeks'),
('demo-user-04', 'Jewelry Making Supplies Kit', 'Comprehensive jewelry making kit with beads, wire, tools, and findings. Enough supplies to create dozens of unique pieces.', 'Art & Crafts', 'Like New', 120.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['jewelry', 'beads', 'crafts', 'supplies'], NOW() - INTERVAL '1 week'),
('demo-user-04', 'Vintage Sewing Machine', 'Beautiful 1960s Singer sewing machine in working condition. Comes with original case and accessories. Perfect for quilting and garment making.', 'Art & Crafts', 'Good', 160.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['sewing', 'singer', 'vintage', 'quilting'], NOW() - INTERVAL '4 days'),
('demo-user-04', 'Handmade Ceramic Bowl Set', 'Set of 6 handmade ceramic bowls with unique glazes. Food safe and dishwasher safe. Each piece is one-of-a-kind.', 'Art & Crafts', 'Like New', 75.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['ceramic', 'handmade', 'bowls', 'pottery'], NOW() - INTERVAL '3 days'),
('demo-user-04', 'Fabric Scrap Collection', 'Large collection of high-quality fabric scraps perfect for quilting, crafts, or small sewing projects. Includes cotton, silk, and wool.', 'Art & Crafts', 'Good', 45.00, 'https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['fabric', 'quilting', 'scraps', 'sewing'], NOW() - INTERVAL '6 days'),

-- FitnessFreak_Alex's items
('demo-user-05', 'Olympic Weight Set', 'Complete Olympic weight set with barbell and 300lbs of plates. All equipment in excellent condition. Perfect for serious home gym setup.', 'Sports & Outdoors', 'Very Good', 420.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['weights', 'olympic', 'barbell', 'gym'], NOW() - INTERVAL '2 weeks'),
('demo-user-05', 'Adjustable Dumbbells', 'PowerBlock adjustable dumbbells, 5-50lbs per hand. Space-saving design perfect for home workouts. Includes stand.', 'Sports & Outdoors', 'Good', 280.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['dumbbells', 'adjustable', 'powerblock', 'home-gym'], NOW() - INTERVAL '1 week'),
('demo-user-05', 'Yoga Mat Collection', 'Set of 5 premium yoga mats in different thicknesses and materials. Perfect for yoga studio or personal practice.', 'Sports & Outdoors', 'Like New', 90.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['yoga', 'mats', 'fitness', 'meditation'], NOW() - INTERVAL '5 days'),
('demo-user-05', 'Resistance Band Set', 'Professional resistance band set with door anchor, handles, and ankle straps. Perfect for travel workouts or home training.', 'Sports & Outdoors', 'Like New', 35.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['resistance', 'bands', 'portable', 'workout'], NOW() - INTERVAL '3 days'),
('demo-user-05', 'Foam Roller and Recovery Kit', 'Complete recovery kit with foam rollers, massage balls, and stretching straps. Essential for post-workout recovery.', 'Sports & Outdoors', 'Good', 65.00, 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['recovery', 'foam-roller', 'massage', 'stretching'], NOW() - INTERVAL '7 days');

-- Continue with more items for remaining users...
-- (Adding a few more key items to demonstrate variety)

INSERT INTO items (user_id, title, description, category, condition, price, image_url, tags, created_at) VALUES
-- MusicMaven_Luna's items
('demo-user-06', 'Vintage Fender Stratocaster', '1970s Fender Stratocaster in sunburst finish. Original pickups and hardware. Some wear but plays beautifully. A true classic!', 'Music & Instruments', 'Good', 480.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['fender', 'stratocaster', 'guitar', 'vintage'], NOW() - INTERVAL '2 weeks'),
('demo-user-06', 'Professional Microphone Set', 'Shure SM57 and SM58 microphone pair with stands and cables. Industry standard mics perfect for recording or live performance.', 'Music & Instruments', 'Very Good', 220.00, 'https://images.pexels.com/photos/1407322/pexels-photo-1407322.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['microphone', 'shure', 'recording', 'professional'], NOW() - INTERVAL '1 week'),

-- GamerGuru_Tyler's items
('demo-user-07', 'Nintendo 64 Complete Collection', 'Nintendo 64 console with 4 controllers and 25 games including GoldenEye, Mario Kart, and Zelda. All tested and working perfectly.', 'Electronics', 'Very Good', 350.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['nintendo64', 'retro', 'gaming', 'complete'], NOW() - INTERVAL '10 days'),
('demo-user-07', 'Arcade Cabinet Kit', 'DIY arcade cabinet kit with all hardware and instructions. Perfect project for retro gaming enthusiasts. Raspberry Pi compatible.', 'Electronics', 'Like New', 180.00, 'https://images.pexels.com/photos/1637438/pexels-photo-1637438.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['arcade', 'diy', 'cabinet', 'retro'], NOW() - INTERVAL '5 days'),

-- PlantParent_Emma's items
('demo-user-08', 'Rare Monstera Variegata', 'Beautiful variegated Monstera deliciosa cutting with established roots. Stunning white and green variegation. Very rare find!', 'Home & Garden', 'Like New', 150.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['monstera', 'variegated', 'rare', 'houseplant'], NOW() - INTERVAL '3 days'),
('demo-user-08', 'Hydroponic Growing System', 'Complete hydroponic system for growing herbs and vegetables indoors. Includes LED grow lights and nutrient solutions.', 'Home & Garden', 'Good', 120.00, 'https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['hydroponic', 'growing', 'indoor', 'herbs'], NOW() - INTERVAL '1 week'),

-- ChefCharlie's items
('demo-user-09', 'Professional Knife Set', 'Wusthof Classic 8-piece knife set with wooden block. Barely used, professionally sharpened. Perfect for serious home cooks.', 'Home & Garden', 'Like New', 280.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['knives', 'wusthof', 'professional', 'cooking'], NOW() - INTERVAL '1 week'),
('demo-user-09', 'Stand Mixer with Attachments', 'KitchenAid Artisan stand mixer in red with pasta, meat grinder, and ice cream attachments. Excellent condition.', 'Home & Garden', 'Very Good', 320.00, 'https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=400', ARRAY['kitchenaid', 'mixer', 'attachments', 'baking'], NOW() - INTERVAL '4 days');

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