/*
  # Update user role to admin

  1. Changes
    - Update user with email "junkmailjumon@gmail.com" to have admin role
    - This will grant admin access to the admin dashboard

  2. Security
    - Only updates the specific user by email
    - Sets role to 'admin' which is validated by existing check constraint
*/

-- Update the user's role to admin
UPDATE users 
SET role = 'admin', updated_at = now()
WHERE id IN (
  SELECT id 
  FROM auth.users 
  WHERE email = 'junkmailjumon@gmail.com'
);

-- Verify the update (this will show the updated user if successful)
SELECT u.id, u.username, u.role, au.email
FROM users u
JOIN auth.users au ON u.id = au.id
WHERE au.email = 'junkmailjumon@gmail.com';