-- =============================================================================
-- Barter: Connection model migration (draft, for review only, do not run yet)
--
-- Context: replaces the item-pair-keyed `matches` table with a user-pair-keyed
-- `connections` table, per PRD §3. Splits out trade completion into its own
-- tables (`trade_completions` / `trade_completion_items`) since a connection
-- can now span multiple trades over time, and a connection is not the same
-- thing as a single completed trade (see: repeat-trade / repeat-review
-- discussion).
--
-- Data decision: only 11 users, 2 matches, 14 messages, 4 reviews, 110 swipes
-- exist today, all confirmed as pre-launch test data. No backfill is being
-- attempted. Existing rows in matches/messages/reviews/swipes are being
-- retired, not migrated.
--
-- BEFORE RUNNING THIS FILE: export matches, messages, reviews, and swipes to
-- CSV as a precaution (same pattern already used for the issues/
-- system_item_interests/profile_views cleanup). This migration does not do
-- that export for you.
--
-- DECIDED (see chat discussion):
--   - Account deletion: reviews are anonymized, not cascaded, when the
--     REVIEWER deletes their account (reviewer_id -> null), so the
--     reviewee keeps their earned reputation. If the REVIEWEE deletes
--     their account, the review still cascades away (unchanged), since
--     there's no one left for it to be about. Messages still fully
--     cascade either direction, unchanged, that's left for the parked
--     GDPR retention-vs-deletion legal question already in the PRD, not
--     decided here.
--   - Dispute integrity: the schema only enforces "must be a connection
--     participant, and must be disputing as themselves" (see the
--     trade_completions trigger below). The specific business rules for
--     who may dispute and by when are left to the Mark-Trade-Complete /
--     dispute RPCs, not enforced rigidly in the schema, consistent with
--     PRD §10's moderator-review model for disputes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Retire old test data (see note above: back this up first, this is
--    destructive). Order matters because of FK dependencies. Also required,
--    not just tidy: the `add column ... not null` statements below on
--    messages/reviews have no default, so they fail outright if any rows
--    still exist.
-- -----------------------------------------------------------------------------
delete from reviews;
delete from messages;
delete from swipes;
delete from matches;

-- -----------------------------------------------------------------------------
-- 1b. Rename swipes -> responses; rename direction values left/right/super to
--    pass/like.
--
-- Note: is_super_like lives on `matches` (dropped in full in step 8 below),
-- not on `swipes` — there is no is_super_like column on this table to drop.
-- The "remove Super Like entirely" decision is satisfied here by shrinking
-- the direction check constraint down to just pass/like (no more 'super'),
-- plus matches.is_super_like disappearing when matches is dropped.
--
-- The table is empty at this point (see `delete from swipes` 3 lines above),
-- so there's no existing 'left'/'right'/'super' data to remap — this
-- constraint swap is safe as a straight drop + add.
-- -----------------------------------------------------------------------------
alter table swipes rename to responses;

alter table responses rename constraint swipes_pkey to responses_pkey;
alter table responses rename constraint swipes_user_id_fkey to responses_user_id_fkey;
alter table responses rename constraint swipes_item_id_fkey to responses_item_id_fkey;
alter table responses rename constraint swipes_user_id_item_id_key to responses_user_id_item_id_key;

alter table responses drop constraint swipes_direction_check;
alter table responses add constraint responses_direction_check check (direction in ('pass', 'like'));

alter index idx_swipes_item rename to idx_responses_item;
alter index idx_swipes_user_date rename to idx_responses_user_date;
alter index idx_swipes_user_item_direction rename to idx_responses_user_item_direction;

-- -----------------------------------------------------------------------------
-- 2. connections — one row per user pair, ever
--
-- Note for whatever writes to this table (the rewritten RPC): user_id_1 must
-- always be the smaller UUID of the pair, user_id_2 the larger. That
-- ordering is not automatic, the inserting code must normalize it, or the
-- check constraint below will reject the insert.
-- -----------------------------------------------------------------------------
create table connections (
  id uuid primary key default gen_random_uuid(),
  user_id_1 uuid not null references users(id) on delete cascade,
  user_id_2 uuid not null references users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  ended_at timestamptz,
  ended_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_user_order check (user_id_1 < user_id_2),
  constraint connections_unique_pair unique (user_id_1, user_id_2)
);

alter table connections enable row level security;

create policy "Users can read their connections"
  on connections for select
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "Users can create connections"
  on connections for insert
  with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "Users can update their connections"
  on connections for update
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- Fix: without this, an UPDATE's WITH CHECK (identical to USING, since none
-- was specified) only re-validates against the NEW row, so a participant
-- could swap user_id_1 or user_id_2 to a third person's ID and still pass.
-- This locks both columns after creation; only status/ended_at/ended_by
-- may change.
create function prevent_connection_participant_change()
returns trigger as $$
begin
  if new.user_id_1 <> old.user_id_1 or new.user_id_2 <> old.user_id_2 then
    raise exception 'Connection participants cannot be changed after creation';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger connections_lock_participants
  before update on connections
  for each row execute function prevent_connection_participant_change();

-- -----------------------------------------------------------------------------
-- 3. connection_item_interests — which item pairs sparked a mutual like
-- -----------------------------------------------------------------------------
create table connection_item_interests (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  item_id_1 uuid not null references items(id) on delete cascade,
  item_id_2 uuid not null references items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint connection_item_interests_unique unique (connection_id, item_id_1, item_id_2),
  constraint connection_item_interests_distinct_items check (item_id_1 <> item_id_2)
);

create index connection_item_interests_connection_id_idx
  on connection_item_interests (connection_id);

alter table connection_item_interests enable row level security;

create policy "Users can read their connection item interests"
  on connection_item_interests for select
  using (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can create connection item interests"
  on connection_item_interests for insert
  with check (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- -----------------------------------------------------------------------------
-- 4. trade_completions — one row per actual completed trade
-- -----------------------------------------------------------------------------
create table trade_completions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  completed_by uuid not null references users(id),
  completed_at timestamptz not null default now(),
  dispute_deadline timestamptz not null default (now() + interval '7 days'),
  disputed_at timestamptz,
  disputed_by uuid references users(id)
);

create index trade_completions_connection_id_idx
  on trade_completions (connection_id);

alter table trade_completions enable row level security;

create policy "Users can read their trade completions"
  on trade_completions for select
  using (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can create trade completions"
  on trade_completions for insert
  with check (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can update their trade completions"
  on trade_completions for update
  using (
    exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- Fix: same class of hijack risk as connections above, plus a second
-- identity issue, without this, a user could set disputed_by to the OTHER
-- participant's ID rather than their own. This locks connection_id/
-- completed_by/completed_at/dispute_deadline after creation (they're
-- historical facts about the trade), and requires that whoever disputes
-- can only name themselves as the disputer.
create function protect_trade_completion_core_fields()
returns trigger as $$
begin
  if new.connection_id <> old.connection_id
     or new.completed_by <> old.completed_by
     or new.completed_at <> old.completed_at
     or new.dispute_deadline <> old.dispute_deadline then
    raise exception 'Core trade completion fields cannot be changed after creation';
  end if;
  if new.disputed_by is not null and new.disputed_by <> auth.uid() then
    raise exception 'Only the disputing user can set themselves as the disputer';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trade_completions_protect_core
  before update on trade_completions
  for each row execute function protect_trade_completion_core_fields();

-- -----------------------------------------------------------------------------
-- 5. trade_completion_items — which specific items were exchanged in a trade
-- -----------------------------------------------------------------------------
create table trade_completion_items (
  id uuid primary key default gen_random_uuid(),
  trade_completion_id uuid not null references trade_completions(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  constraint trade_completion_items_unique unique (trade_completion_id, item_id)
);

create index trade_completion_items_trade_completion_id_idx
  on trade_completion_items (trade_completion_id);

alter table trade_completion_items enable row level security;

create policy "Users can read their trade completion items"
  on trade_completion_items for select
  using (
    exists (
      select 1 from trade_completions tc
      join connections c on c.id = tc.connection_id
      where tc.id = trade_completion_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can create trade completion items"
  on trade_completion_items for insert
  with check (
    exists (
      select 1 from trade_completions tc
      join connections c on c.id = tc.connection_id
      where tc.id = trade_completion_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- -----------------------------------------------------------------------------
-- 5b. Drop old matches-dependent RLS policies on messages/reviews/items.
--
-- These three messages policies, two reviews policies, and one items policy
-- aren't in any prior migration file (confirmed against live Barter2 via
-- pg_policies) — they were added directly on the database outside version
-- control, consistent with the other undocumented live drift already noted
-- in the project plan. Postgres tracks policy dependencies on the specific
-- columns/tables their USING/WITH CHECK clauses reference, so these must be
-- dropped before both the `drop column match_id` statements below and
-- `drop table matches` in step 8 — otherwise both fail with a dependency
-- error.
-- -----------------------------------------------------------------------------
drop policy "Users can read messages from their matches" on messages;
drop policy "Users can send messages to their matches" on messages;
drop policy "Users can update messages in their matches" on messages;
drop policy "Users can create reviews for their completed trades" on reviews;
drop policy "Users can read reviews about themselves or their trades" on reviews;
drop policy "Users can read traded items from their completed matches" on items;

-- Recreates, on the new schema, the one items policy dropped just above that
-- referenced matches. Not a faithful port: the old policy checked whether an
-- item was one of the two items in the original match pair
-- (item_id_1/item_id_2) plus completion_status = 'completed'. The old
-- schema never separately tracked "items that matched" versus "items
-- actually exchanged" — and Mark Trade Complete never functioned live
-- before this rewrite, so completion_status = 'completed' wasn't a real,
-- reachable state either. There's no literal old behavior to preserve here.
-- This instead implements the same underlying intent (a trade participant
-- can still see an item once it's confirmed traded) on the new data model,
-- where trade_completion_items is the actual record of which items were
-- exchanged, not just which items matched.
create policy "Users can read traded items from their completed trades"
  on items for select
  using (
    is_active = false
    and exists (
      select 1 from trade_completion_items tci
      join trade_completions tc on tc.id = tci.trade_completion_id
      join connections c on c.id = tc.connection_id
      where tci.item_id = items.id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Repoint messages: match_id -> connection_id
-- -----------------------------------------------------------------------------
alter table messages drop column match_id;
alter table messages add column connection_id uuid not null references connections(id) on delete cascade;

create index messages_connection_id_idx
  on messages (connection_id);

-- Recreates the three policies dropped in step 5b on the new connection_id
-- column. Preserves the exact same active-status asymmetry confirmed against
-- live Barter2: only the insert (send) policy checks connection status,
-- read and update do not (that's how the old matches.status = 'accepted'
-- check was scoped too, not a behavior change introduced here).
create policy "Users can read messages from their connections"
  on messages for select
  using (
    exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can send messages to their connections"
  on messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
        and c.status = 'active'
    )
  );

create policy "Users can update messages in their connections"
  on messages for update
  using (
    exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  )
  with check (
    exists (
      select 1 from connections c
      where c.id = messages.connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- -----------------------------------------------------------------------------
-- 7. Repoint reviews: match_id -> trade_completion_id
--
-- Also implements the "anonymize instead of cascade" decision: reviewer_id
-- now goes to NULL if the reviewer's account is deleted, rather than
-- deleting the review itself, so the reviewee doesn't lose earned
-- reputation just because the other person left. reviewee_id is left as
-- ON DELETE CASCADE (unchanged): if the person the review is ABOUT deletes
-- their account, the review disappearing with them is reasonable, there's
-- no one left for it to be "about".
--
-- Note: dropping match_id auto-drops the existing
-- reviews_match_id_reviewer_id_key unique constraint along with it (Postgres
-- drops constraints that reference a dropped column). That constraint was
-- the actual database-level enforcement of "one review per completed trade"
-- per PRD §4/§6, so it's explicitly recreated below on the new column,
-- not left to be quietly lost.
-- -----------------------------------------------------------------------------
alter table reviews drop column match_id;
alter table reviews add column trade_completion_id uuid not null references trade_completions(id) on delete cascade;
alter table reviews add constraint reviews_trade_completion_id_reviewer_id_key unique (trade_completion_id, reviewer_id);

alter table reviews alter column reviewer_id drop not null;
alter table reviews drop constraint reviews_reviewer_id_fkey;
alter table reviews add constraint reviews_reviewer_id_fkey
  foreign key (reviewer_id) references users(id) on delete set null;

create index reviews_trade_completion_id_idx
  on reviews (trade_completion_id);

-- Recreates the two policies dropped in step 5b on the new
-- trade_completion_id column. The old insert policy additionally required
-- matches.status = 'accepted'; a trade_completions row only ever exists once
-- a trade is completed, so that status gate has no equivalent to carry
-- forward here — its job is already done by the row's existence.
--
-- Deliberate hardening, not a faithful port: the live insert policy today
-- only checks that the reviewer is A participant in the referenced match —
-- it never constrains reviewee_id, so a request could currently name any
-- UUID as the reviewee. This version closes that gap by requiring
-- reviewee_id to be specifically the OTHER participant in the same
-- connection. This one line is an intentional behavior change from what's
-- live today, not an oversight or a preservation of existing behavior.
create policy "Users can create reviews for their completed trades"
  on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from trade_completions tc
      join connections c on c.id = tc.connection_id
      where tc.id = reviews.trade_completion_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
        and reviewee_id = (case when c.user_id_1 = auth.uid() then c.user_id_2 else c.user_id_1 end)
    )
  );

create policy "Users can read reviews about themselves or their trades"
  on reviews for select
  using (
    reviewer_id = auth.uid()
    or reviewee_id = auth.uid()
    or exists (
      select 1 from trade_completions tc
      join connections c on c.id = tc.connection_id
      where tc.id = reviews.trade_completion_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

-- -----------------------------------------------------------------------------
-- 8. Drop matches
-- -----------------------------------------------------------------------------
drop table matches;

-- =============================================================================
-- NOT included in this file, intentionally, reviewed and applied separately
-- (see the follow-up migration, once approved):
--   - Rewriting check_and_create_match / record_swipe_optimized (renamed to
--     record_response_optimized) to target connections /
--     connection_item_interests instead of matches, and responses instead of
--     swipes.
--   - Note: until that follow-up runs, both functions are transiently broken
--     (they reference `matches` and `swipes`, which no longer exist by name
--     after this file runs) — acceptable here since no rewrite code has
--     shipped and there's no live traffic hitting these RPCs yet.
--   - Any application-code changes (matchService.ts etc.)
-- =============================================================================
