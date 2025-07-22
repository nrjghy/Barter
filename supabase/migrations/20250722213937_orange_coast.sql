/*
  # Fix users table UPDATE permission

  1. Security Changes
    - Add missing RLS policy for authenticated users to update their own data
    - Ensure users can update their own profile information

  The error indicates that users cannot update their own records in the users table.
  This migration adds the missing UPDATE policy to allow authenticated users to 
  modify their own profile data.
*/

-- Drop existing update policy if it exists to recreate it properly
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create the correct UPDATE policy for users to update their own data
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);