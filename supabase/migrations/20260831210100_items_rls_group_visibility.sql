-- Groups feature: extend the public-feed read policy to also cover
-- group-scoped visibility. Group visibility requires is_active = true,
-- same as the public feed -- a cancelled/traded group item disappears
-- from the group too, not just the public feed. Owner sees their own
-- active item regardless of is_public/group state (closes the gap
-- where a private item not yet posted to any group would otherwise be
-- invisible to its own owner). "Users can read own inactive items" is
-- untouched -- inactive items remain owner-only regardless of
-- public/group state.

DROP POLICY "Users can read active toys" ON public.items;

CREATE POLICY "Users can read active toys" ON public.items
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (
      is_public = true
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.item_groups ig
        JOIN public.group_memberships gm ON gm.group_id = ig.group_id
        WHERE ig.item_id = items.id AND gm.user_id = auth.uid()
      )
    )
  );
