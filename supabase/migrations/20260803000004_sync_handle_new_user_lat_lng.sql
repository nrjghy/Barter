CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, username, location, avatar_url, latitude, longitude)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    COALESCE(new.raw_user_meta_data->>'location', null),
    COALESCE(new.raw_user_meta_data->>'avatar_url', null),
    COALESCE((new.raw_user_meta_data->>'latitude')::numeric, null),
    COALESCE((new.raw_user_meta_data->>'longitude')::numeric, null)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
