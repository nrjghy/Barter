-- Backfill items.location (text) from the owner's users.location, for items
-- that don't already have one set. latitude/longitude are already populated
-- for every existing item (via the live populate_item_location trigger), so
-- this only needs to cover the text column. The 2 items that already have a
-- real location value are left untouched by the WHERE clause.
UPDATE public.items i
SET location = u.location
FROM public.users u
WHERE i.user_id = u.id
  AND i.location IS NULL
  AND u.location IS NOT NULL;
