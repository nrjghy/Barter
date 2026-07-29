-- =============================================================================
-- Barter: reconcile message types (draft, for review only, do not run yet)
--
-- Context: PRD §5 / Project Plan already identified a three-way mismatch on
-- message_type -- the live DB CHECK constraint allows ('text','image',
-- 'template'), messageService.ts's own validation allowed
-- ('text','image','location','trade_offer'), and ChatInterface.tsx only
-- ever sent ('text','template'). None of the three agreed with each other,
-- and none matched the agreed target model.
--
-- This migration settles it at the DB level to the agreed four-type model:
-- text, photo, location, system. This is the minimal piece needed to unblock
-- the Chat data-layer rewrite (sending photo/location messages was being
-- rejected outright by this constraint). It does NOT include the separate,
-- already-flagged follow-up of having check_and_create_match insert a
-- system "You matched!" message on connection creation -- that's an RPC
-- change, not a constraint change, and isn't required to unblock this work.
--
-- CAUTION: the exact constraint name below (messages_message_type_check) is
-- inferred from Postgres's default naming for an unnamed inline CHECK in
-- the original CREATE TABLE migrations. It has not been confirmed against
-- live Barter2 directly (no live query access from this session) -- verify
-- the actual constraint name first, the same way earlier migrations caught
-- undocumented live drift.
-- =============================================================================

alter table messages drop constraint messages_message_type_check;

alter table messages alter column message_type set default 'text';

alter table messages add constraint messages_message_type_check
  check (message_type in ('text', 'photo', 'location', 'system'));
