/*
  # Add demonstration listings

  1. Demo Items
    - Creates 4 diverse product listings with realistic details
    - Covers different categories and price points
    - Includes detailed descriptions and specifications
    - Uses demo user accounts for sellers

  2. Categories Covered
    - Electronics (Gaming Console)
    - Books (Educational)
    - Sports & Outdoors (Bicycle)
    - Home & Garden (Coffee Maker)

  3. Features
    - Realistic pricing in USD
    - Detailed descriptions
    - Various conditions
    - Different locations
    - Comprehensive tags
*/

-- First, let's create some demo users if they don't exist
INSERT INTO users (id, username, location, avatar_url, rating, total_ratings, rating_sum, is_demo, bio)
VALUES 
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'TechEnthusiast92',
    'San Francisco, CA',
    'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    4.8,
    25,
    120,
    true,
    'Tech lover and collector. Always upgrading to the latest gadgets!'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'BookwormSarah',
    'Austin, TX',
    'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    4.9,
    18,
    88,
    true,
    'Avid reader and student. Love sharing knowledge through books!'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'CyclingMike',
    'Portland, OR',
    'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    4.7,
    32,
    150,
    true,
    'Cycling enthusiast and bike mechanic. Passionate about sustainable transport!'
  ),
  (
    '550e8400-e29b-41d4-a716-446655440004',
    'CoffeeLoverJen',
    'Seattle, WA',
    'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
    4.6,
    22,
    101,
    true,
    'Coffee connoisseur and home barista. Always brewing the perfect cup!'
  )
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  location = EXCLUDED.location,
  avatar_url = EXCLUDED.avatar_url,
  rating = EXCLUDED.rating,
  total_ratings = EXCLUDED.total_ratings,
  rating_sum = EXCLUDED.rating_sum,
  is_demo = EXCLUDED.is_demo,
  bio = EXCLUDED.bio;

-- Now add the demo listings
INSERT INTO items (id, user_id, title, description, category, condition, image_url, tags, price, is_active)
VALUES 
  (
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440001',
    'PlayStation 5 Console with Controller',
    'Barely used PS5 in excellent condition, includes original controller and all cables. Purchased 6 months ago but switching to PC gaming. Console has been kept in smoke-free environment and works perfectly. Includes original box and documentation.',
    'Electronics',
    'Like New',
    'https://images.pexels.com/photos/9072316/pexels-photo-9072316.jpeg?auto=compress&cs=tinysrgb&w=800',
    ARRAY['gaming', 'console', 'playstation', 'controller', 'entertainment'],
    450.00,
    true
  ),
  (
    '660e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440002',
    'Calculus: Early Transcendentals Textbook',
    'Stewart''s Calculus textbook, 8th edition, in great condition with minimal highlighting. Perfect for college-level calculus courses. All pages intact, no water damage or torn pages. Helped me ace my calculus classes!',
    'Books',
    'Very Good',
    'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=800',
    ARRAY['textbook', 'calculus', 'mathematics', 'college', 'education', 'stewart'],
    85.00,
    true
  ),
  (
    '660e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440003',
    'Trek Mountain Bike - 29" Wheels',
    'Well-maintained Trek mountain bike with 29-inch wheels, perfect for trail riding and commuting. Features 21-speed Shimano gears, front suspension, and disc brakes. Recently serviced with new brake pads and chain. Great for intermediate to advanced riders.',
    'Sports & Outdoors',
    'Good',
    'https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=800',
    ARRAY['bicycle', 'mountain-bike', 'trek', 'cycling', 'outdoor', 'transportation', '29-inch'],
    320.00,
    true
  ),
  (
    '660e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440004',
    'Breville Espresso Machine with Grinder',
    'Professional-grade Breville Barista Express espresso machine with built-in conical burr grinder. Makes café-quality espresso, cappuccino, and lattes at home. Includes milk frother, tamper, and cleaning supplies. Excellent condition, lightly used.',
    'Home & Garden',
    'Like New',
    'https://images.pexels.com/photos/4226796/pexels-photo-4226796.jpeg?auto=compress&cs=tinysrgb&w=800',
    ARRAY['espresso', 'coffee', 'breville', 'grinder', 'kitchen', 'appliance', 'barista'],
    280.00,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  condition = EXCLUDED.condition,
  image_url = EXCLUDED.image_url,
  tags = EXCLUDED.tags,
  price = EXCLUDED.price,
  is_active = EXCLUDED.is_active;