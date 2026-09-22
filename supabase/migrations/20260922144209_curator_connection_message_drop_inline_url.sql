-- Removes the raw source_url from the curator-connection system message
-- body: ChatThread.tsx already renders a separate "View original listing"
-- card (CuratorListingMessage, keyed off message.data.sourceUrl) with the
-- same link, and the URL embedded in the text overflowed on mobile. The
-- link is still sent in message.data.sourceUrl for that card -- only the
-- inline text copy is removed.

CREATE OR REPLACE FUNCTION public.create_curator_connection(interested_user_id uuid, curator_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  lister_user_id uuid;
  item_is_active boolean;
  item_title text;
  item_source_url text;
  item_location text;
  lister_is_curator boolean;
  lister_username text;
  interested_username text;
  the_connection_id uuid;
  is_new_connection boolean;
  already_registered boolean;
  message_content text;
begin
  if auth.uid() is null or auth.uid() != interested_user_id then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  select i.user_id, i.is_active, i.title, i.source_url, i.location, u.is_curator
  into lister_user_id, item_is_active, item_title, item_source_url, item_location, lister_is_curator
  from items i
  join users u on u.id = i.user_id
  where i.id = curator_item_id;

  if lister_user_id is null or item_is_active is not true then
    return jsonb_build_object('error', 'Item not found or inactive');
  end if;

  if lister_is_curator is not true then
    return jsonb_build_object('error', 'Item is not a curated listing');
  end if;

  if lister_user_id = interested_user_id then
    return jsonb_build_object('error', 'Cannot express interest in your own item');
  end if;

  if exists (
    select 1 from user_blocks ub
    where (ub.blocker_id = interested_user_id and ub.blocked_id = lister_user_id)
       or (ub.blocker_id = lister_user_id and ub.blocked_id = interested_user_id)
  ) then
    return jsonb_build_object('connectionCreated', false, 'reason', 'blocked');
  end if;

  if not exists (
    select 1 from responses
    where user_id = interested_user_id
      and item_id = curator_item_id
      and direction = 'like'
  ) then
    return jsonb_build_object('error', 'You have not expressed interest in this item');
  end if;

  select *
  into the_connection_id, is_new_connection, already_registered
  from public._bootstrap_one_directional_connection(interested_user_id, lister_user_id, curator_item_id);

  if already_registered then
    return jsonb_build_object(
      'connectionCreated', true,
      'connectionId', the_connection_id,
      'isNewConnection', is_new_connection,
      'alreadyRegistered', true,
      'curatorItemId', curator_item_id
    );
  end if;

  select coalesce(username, 'Barter Finds') into lister_username from users where id = lister_user_id;
  select coalesce(username, 'Someone') into interested_username from users where id = interested_user_id;
  item_title := coalesce(item_title, 'an item');

  if is_new_connection then
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'Interest in a curated listing',
       interested_username || ' is interested in your ''' || item_title || '''! Check the chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'You''re connected!',
       'You''re connected with ' || lister_username || ' about a curated listing.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));
  else
    insert into notifications (user_id, type, title, content, data)
    values
      (lister_user_id, 'match', 'More interest in your curated listings',
       interested_username || ' is also interested in your ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat')),
      (interested_user_id, 'match', 'New item in your chat',
       'You expressed interest in ' || lister_username || '''s ''' || item_title || '''. Check your chat.',
       jsonb_build_object('connectionId', the_connection_id, 'actionPath', '/chat/' || the_connection_id, 'actionLabel', 'Open chat'));
  end if;

  message_content := 'Thanks for your interest!' ||
    case when item_location is not null then ' This listing was found in ' || item_location || '.' else '' end ||
    ' It isn''t listed by a Barter user, so use the link below to contact the original lister directly (login required). Questions? Reply here, the Barter team reads these messages.';

  insert into messages (connection_id, sender_id, content, message_type, is_read, data)
  values (
    the_connection_id,
    lister_user_id,
    message_content,
    'system',
    false,
    jsonb_build_object('itemId', curator_item_id, 'sourceUrl', item_source_url)
  );

  return jsonb_build_object(
    'connectionCreated', true,
    'connectionId', the_connection_id,
    'isNewConnection', is_new_connection,
    'alreadyRegistered', false,
    'curatorItemId', curator_item_id
  );
end;
$function$
