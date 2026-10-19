-- Email delivery ledger and reconciliation (2026-10-19).
--
-- Why: a 25-row broadcast insert fired 25 calls at Resend in one second, 15
-- failed, and nothing recorded or flagged it; it was only noticed by looking
-- at the Resend dashboard. The send-notification-email function now writes
-- one row per notification here, and check_email_deliveries() (pg_cron, every
-- 15 minutes) raises an alert for any send that failed or never got a row.
--
-- The alert is a normal notification to every admin (users.role = 'admin'),
-- so it rides the existing notification -> email pipeline and also shows in
-- the in-app list. It is flagged data.emailDeliveryAlert so a failing alert
-- can never alert about itself in a loop.
--
-- Limitation, deliberate: the alert email goes through Resend too, so a total
-- Resend outage will not email the admin. The failed rows still land in this
-- table (queryable), and the in-app alert still appears.

create table if not exists public.email_deliveries (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  user_id uuid not null,
  category text,
  status text not null check (status in ('sent', 'failed', 'skipped', 'missing')),
  attempts integer,
  resend_status integer,
  resend_email_id text,
  error text,
  alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_deliveries_unalerted_idx
  on public.email_deliveries (created_at)
  where status in ('failed', 'missing') and alerted_at is null;

-- Service role only: no policies, and no grants to the API roles.
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon, authenticated;

-- One row. ledger_started_at stays null until the function that writes the
-- ledger is deployed; the checker does nothing while it is null, so
-- notifications created before the ledger existed are never reported missing.
create table if not exists public.email_delivery_state (
  singleton boolean primary key default true check (singleton),
  ledger_started_at timestamptz
);
insert into public.email_delivery_state (singleton) values (true) on conflict do nothing;
alter table public.email_delivery_state enable row level security;
revoke all on public.email_delivery_state from anon, authenticated;

create or replace function public.check_email_deliveries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
  v_total integer;
  v_lines text;
  v_admin record;
begin
  select ledger_started_at into v_started from email_delivery_state where singleton;
  if v_started is null then
    return 0;
  end if;

  -- 1. Notifications that should have been emailed but have no ledger row 3+
  -- minutes after insert (function crashed, call dropped, pg_net lost it).
  -- Mirrors trigger_send_notification_email: a category whose email
  -- preference is false is never sent, everything else is.
  insert into email_deliveries (notification_id, user_id, status, error)
  select n.id, n.user_id, 'missing', 'no delivery record 3+ minutes after insert'
  from notifications n
  where n.created_at >= v_started
    and n.created_at < now() - interval '3 minutes'
    and n.created_at > now() - interval '2 days'
    and not (coalesce(n.data, '{}'::jsonb) ? 'emailDeliveryAlert')
    and not exists (select 1 from email_deliveries d where d.notification_id = n.id)
    and not exists (
      select 1 from users u
      where u.id = n.user_id
        and coalesce(
              (u.notification_preferences -> (case n.type
                 when 'match' then 'match'
                 when 'like' then 'match'
                 when 'message' then 'message'
                 when 'product_update' then 'product_update'
                 when 'review_reminder' then 'review_reminder'
                 when 'onboarding_list_prompt' then 'onboarding'
               end) ->> 'email')::boolean, true) = false
    )
  on conflict (notification_id) do nothing;

  -- 2. Everything failed or missing that has not been alerted yet.
  select count(*) into v_total
  from email_deliveries d
  join notifications n on n.id = d.notification_id
  where d.status in ('failed', 'missing') and d.alerted_at is null
    and not (coalesce(n.data, '{}'::jsonb) ? 'emailDeliveryAlert');

  if v_total = 0 then
    return 0;
  end if;

  select string_agg(
           '- ' || n.type || ' to ' || coalesce(u.username, 'unknown user') || ': ' || d.status
             || case when d.resend_status is not null then ' (Resend ' || d.resend_status || ')' else '' end,
           E'\n' order by d.created_at)
    into v_lines
  from (
    select d.* from email_deliveries d
    join notifications n2 on n2.id = d.notification_id
    where d.status in ('failed', 'missing') and d.alerted_at is null
      and not (coalesce(n2.data, '{}'::jsonb) ? 'emailDeliveryAlert')
    order by d.created_at limit 15
  ) d
  join notifications n on n.id = d.notification_id
  left join users u on u.id = d.user_id;

  for v_admin in select id from users where role = 'admin' loop
    insert into notifications (user_id, type, title, content, data)
    values (
      v_admin.id,
      'system',
      'Email delivery problem: ' || v_total || ' not delivered',
      v_total || ' notification email(s) failed or went missing. Details are in the email_deliveries table.',
      jsonb_build_object(
        'emailDeliveryAlert', true,
        'emailBody',
          v_total || E' notification email(s) failed or went missing.\n\n'
          || coalesce(v_lines, '')
          || case when v_total > 15 then E'\n\n...and ' || (v_total - 15) || ' more.' else '' end
          || E'\n\nDetails: select * from email_deliveries where status in (''failed'', ''missing'') order by created_at desc;'
      )
    );
  end loop;

  update email_deliveries d
     set alerted_at = now(), updated_at = now()
   from notifications n
  where n.id = d.notification_id
    and d.status in ('failed', 'missing') and d.alerted_at is null
    and not (coalesce(n.data, '{}'::jsonb) ? 'emailDeliveryAlert');

  return v_total;
end;
$$;

revoke all on function public.check_email_deliveries() from public, anon, authenticated;

select cron.schedule('check-email-deliveries', '*/15 * * * *', 'select public.check_email_deliveries();');
