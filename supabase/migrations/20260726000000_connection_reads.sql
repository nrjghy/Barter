-- =============================================================================
-- Barter: connection_reads (draft, for review only, do not run yet)
--
-- Context: the Chat list's "New" marker (PRD §5) needs to know, per user per
-- connection, whether that user has ever opened the thread. Nothing in the
-- connection-model migration tracks this -- connections has no per-user
-- state, and messages.is_read is per-message, not per-connection (a
-- brand-new connection with zero messages still needs to show as "New").
--
-- Decided (see chat discussion): a separate table, one row per
-- (connection, user), rather than two nullable columns on connections
-- directly (opened_at_user_1 / opened_at_user_2). This matches the existing
-- precedent of connection_item_interests already being split out as its own
-- table, and avoids "which slot am I" logic when writing -- opening a
-- thread is always just "upsert my own row," regardless of whether I'm
-- user_id_1 or user_id_2 on the connection.
--
-- A connection is "New" for a user if no row exists here yet for
-- (connection_id, user_id). Scope note: this only tracks "has this user
-- ever opened this thread at all" -- it does not attempt to re-trigger
-- "New" after a repeat mutual like on an already-opened connection. Repeat
-- mutual likes get their own notification (see check_and_create_match),
-- which is a separate mechanism from this Chat-list badge.
-- =============================================================================

create table connection_reads (
  connection_id uuid not null references connections(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  primary key (connection_id, user_id)
);

create index connection_reads_user_id_idx on connection_reads (user_id);

alter table connection_reads enable row level security;

create policy "Users can read their own connection read state"
  on connection_reads for select
  using (auth.uid() = user_id);

create policy "Users can set their own connection read state"
  on connection_reads for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from connections c
      where c.id = connection_id
        and (auth.uid() = c.user_id_1 or auth.uid() = c.user_id_2)
    )
  );

create policy "Users can update their own connection read state"
  on connection_reads for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
