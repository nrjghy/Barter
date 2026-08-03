-- Login history data capture (PRD §9: "data capture is a v1 requirement; the
-- user-facing 'view my logins' screen is deferred to Phase 2"). Captures
-- who/when/what (signup/login) via triggers on auth.users, which is the
-- documented, standard-supported pattern -- not a trigger directly on
-- Supabase's own managed auth.audit_log_entries table. IP/user-agent are
-- deliberately not captured here: a Postgres trigger has no visibility into
-- the calling client's HTTP context, so that would require a separate
-- client-side onAuthStateChange + RPC pass, out of scope for this migration.

CREATE TABLE public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('signup', 'login')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_history_user_id_created_at_idx
  ON public.login_history (user_id, created_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- Prep for the Phase 2 "view my logins" screen -- each user can already read
-- only their own rows once that screen exists, no RLS work needed later.
CREATE POLICY "Users can view own login history"
  ON public.login_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for authenticated/anon: only the
-- SECURITY DEFINER trigger function (running as postgres, which owns this
-- table) writes here.

CREATE OR REPLACE FUNCTION public.capture_login_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.login_history (user_id, event_type, created_at)
    VALUES (NEW.id, 'signup', COALESCE(NEW.created_at, now()));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.login_history (user_id, event_type, created_at)
    VALUES (NEW.id, 'login', COALESCE(NEW.last_sign_in_at, now()));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a login_history logging failure break the actual auth
  -- operation that triggered it -- log and continue.
  RAISE WARNING 'capture_login_history failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- Independent of the existing on_auth_user_created trigger (handle_new_user) --
-- Postgres fires multiple triggers on the same event fine, no need to touch
-- that existing, already-working trigger.
CREATE TRIGGER on_auth_user_signup_capture_login_history
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_login_history();

CREATE TRIGGER on_auth_user_login_capture_login_history
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.capture_login_history();

REVOKE ALL ON public.login_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.login_history TO authenticated; -- RLS above still scopes to own rows only

REVOKE EXECUTE ON FUNCTION public.capture_login_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.capture_login_history() FROM anon, authenticated;
