-- Groups feature: RLS for groups/group_memberships/item_groups.
-- All writes go through RPCs, matching connections/offers/
-- trade_completions -- SELECT only here.
--
-- is_member_of_group avoids a raw self-referencing policy on
-- group_memberships (a policy on a table querying that same table
-- within its own USING clause), the standard safe pattern for
-- "am I in the same group as this row" checks.

CREATE FUNCTION public.is_member_of_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_memberships
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_group(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_member_of_group(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_group(uuid) TO authenticated;

CREATE POLICY "Members can read their groups" ON public.groups
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_group(id)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Members can read fellow members" ON public.group_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_group(group_id)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Members can read their group's item assignments" ON public.item_groups
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_group(group_id)
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
