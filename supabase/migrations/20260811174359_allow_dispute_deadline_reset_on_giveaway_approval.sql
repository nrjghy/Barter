CREATE OR REPLACE FUNCTION public.protect_trade_completion_core_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if new.connection_id <> old.connection_id
     or new.completed_by <> old.completed_by
     or new.completed_at <> old.completed_at then
    raise exception 'Core trade completion fields cannot be changed after creation';
  end if;

  if new.dispute_deadline <> old.dispute_deadline then
    if old.status = 'pending_approval' and new.status = 'approved' then
      -- allowed: giveaway approval resets the dispute window to start at approval, not claim
      null;
    else
      raise exception 'Core trade completion fields cannot be changed after creation';
    end if;
  end if;

  if new.disputed_by is not null and new.disputed_by <> auth.uid() then
    raise exception 'Only the disputing user can set themselves as the disputer';
  end if;

  return new;
end;
$function$;
