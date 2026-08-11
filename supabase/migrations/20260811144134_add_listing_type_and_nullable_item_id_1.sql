ALTER TABLE public.items
  ADD COLUMN listing_type text NOT NULL DEFAULT 'trade';

ALTER TABLE public.items
  ADD CONSTRAINT items_listing_type_check
  CHECK (listing_type = ANY (ARRAY['trade'::text, 'giveaway'::text]));

ALTER TABLE public.connection_item_interests
  ALTER COLUMN item_id_1 DROP NOT NULL;
