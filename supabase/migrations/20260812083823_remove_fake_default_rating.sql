ALTER TABLE public.users ALTER COLUMN rating DROP DEFAULT;

UPDATE public.users
SET rating = NULL
WHERE total_ratings = 0
  AND id IN (SELECT id FROM auth.users);

CREATE OR REPLACE FUNCTION public.update_user_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update the reviewee's rating
  UPDATE users
  SET
    rating_sum = COALESCE((
      SELECT SUM(rating)
      FROM reviews
      WHERE reviewee_id = NEW.reviewee_id
    ), 0),
    total_ratings = COALESCE((
      SELECT COUNT(*)
      FROM reviews
      WHERE reviewee_id = NEW.reviewee_id
    ), 0),
    rating = CASE
      WHEN (SELECT COUNT(*) FROM reviews WHERE reviewee_id = NEW.reviewee_id) > 0
      THEN (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM reviews
        WHERE reviewee_id = NEW.reviewee_id
      )
      ELSE NULL
    END
  WHERE id = NEW.reviewee_id;

  RETURN NEW;
END;
$function$;
