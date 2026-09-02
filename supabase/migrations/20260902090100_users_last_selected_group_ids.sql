-- Groups: remember the poster's last-used group selection for new listings.
-- Currently live on Barter-dev only (created directly via Supabase MCP), no
-- prior migration file existed for either the column or the RPC.
-- Pulled directly from Barter-dev (nfcqsehbcrgzycpwyrax) on 2026-09-02.

alter table public.users
  add column if not exists last_selected_group_ids uuid[] not null default '{}';

create or replace function public.update_last_selected_groups(p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.users
  set last_selected_group_ids = coalesce(p_group_ids, '{}')
  where id = auth.uid();
end;
$function$;

grant execute on function public.update_last_selected_groups(uuid[]) to authenticated;
