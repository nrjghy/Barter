-- Keep items.updated_at when a write changes only the translation columns.
-- Why: send_inactivity_reminders and archive_inactive_listings (daily cron) key off updated_at.
-- Translating a listing (or backfilling translations) is not owner activity, so it must not restart
-- the 30-day inactivity clock or rescue a reminded listing from archiving.
-- Every other update keeps the old behavior, including the "still available" confirmation, which
-- touches only updated_at (translation columns unchanged, so the first condition below is false).
CREATE OR REPLACE FUNCTION public.set_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.original_language, NEW.title_en, NEW.description_en, NEW.translated_at)
         IS DISTINCT FROM (OLD.original_language, OLD.title_en, OLD.description_en, OLD.translated_at)
     AND (to_jsonb(NEW) - 'updated_at' - 'original_language' - 'title_en' - 'description_en' - 'translated_at')
         = (to_jsonb(OLD) - 'updated_at' - 'original_language' - 'title_en' - 'description_en' - 'translated_at')
  THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
