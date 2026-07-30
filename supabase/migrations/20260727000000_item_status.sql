-- =============================================================================
-- Barter: items.status (draft, for review only, do not run yet)
--
-- Context: My Stuff (PRD §13) needs four distinct listing statuses --
-- Active, Cancelled, Traded, Expired -- but items currently only has a
-- boolean is_active. That can't distinguish *why* something is inactive,
-- which is exactly what the status badges need to show.
--
-- Decided (see chat discussion): a real status column, matching how every
-- other state concept in this project has been handled (connections got a
-- real status enum, messages got a real message_type enum) rather than
-- inferring status from other signals after the fact.
--
-- is_active is kept, not dropped -- Discover's feed query already filters
-- on it and that's out of scope here. The two are kept in sync: whenever
-- status moves away from 'active', is_active is set to false alongside it.
--
-- Scope note: only 'active' and 'cancelled' are actually reachable by any
-- action built so far. Nothing sets 'traded' yet (that's Mark Trade
-- Complete, not yet built) or 'expired' yet (the inactivity auto-archive
-- job, also not yet built). This adds the full four-value column now so
-- those features have something to write into later, without needing
-- their own migration just for this.
--
-- The 783 live items are all pre-launch test data (already flagged
-- elsewhere as safe to treat as disposable), so the backfill below is a
-- simple default, not a real data-preservation concern: active stays
-- 'active', everything currently inactive becomes 'cancelled' (a
-- reasonable default since there's no existing signal for *why* those
-- particular rows were deactivated).
-- =============================================================================

alter table items add column status text not null default 'active'
  check (status in ('active', 'cancelled', 'traded', 'expired'));

update items set status = case when is_active then 'active' else 'cancelled' end;
