/*
  # Fix user signup trigger

  1. Database Functions
    - Create or replace the `handle_new_user` function to properly handle new user signups
    - Extract username from auth metadata and insert into users table
  
  2. Triggers
    - Ensure trigger is properly set up on auth.users table
    - Trigger fires on INSERT to create corresponding public.users record
  
  3. Security
    - Ensure RLS policies allow the trigger to insert data
    - Verify foreign key constraints are properly handled
*/

-- Create or replace the function that handles new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, username, location, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    COALESCE(new.raw_user_meta_data->>'location', null),
    COALESCE(new.raw_user_meta_data->>'avatar_url', null)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;