ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trade_blocked_hint_dismissed_at timestamptz;
