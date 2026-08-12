ALTER TABLE public.users
  ADD COLUMN discover_hint_dismissed_at timestamptz,
  ADD COLUMN my_stuff_hint_dismissed_at timestamptz,
  ADD COLUMN chat_hint_dismissed_at timestamptz;
