/*
  # Add role column to users table

  1. Changes
    - Add `role` column to `users` table with default value 'user'
    - Add check constraint to ensure valid role values
    - Update existing users to have 'user' role by default

  2. Security
    - Role column is used for authorization checks
    - Default role is 'user' for security
*/

-- Add role column to users table
ALTER TABLE users ADD COLUMN role text DEFAULT 'user' NOT NULL;

-- Add check constraint for valid roles
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- Create index for role-based queries
CREATE INDEX idx_users_role ON users(role);