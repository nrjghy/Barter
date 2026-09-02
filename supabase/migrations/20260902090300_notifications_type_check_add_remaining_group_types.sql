-- notifications.type check constraint: add the 3 group-related values that
-- are live on Barter-dev but were never added via a migration.
-- group_invite, group_invite_accepted, group_invite_declined,
-- group_ownership_transferred, group_deleted and group_member_removed each
-- already have their own migration. group_joined_via_link,
-- group_moderator_assigned and group_moderator_removed do not, confirmed by
-- reading the live constraint definition on Barter-dev directly and finding
-- no matching migration file for any of the three.
-- Pulled directly from Barter-dev (nfcqsehbcrgzycpwyrax) on 2026-09-02.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = ANY (ARRAY[
    'match'::text, 'message'::text, 'trade_completed'::text, 'review'::text,
    'system'::text, 'item_unavailable'::text, 'review_reminder'::text,
    'issue_status'::text, 'admin_daily_summary'::text, 'trade_dispute'::text,
    'listing_expiry_reminder'::text, 'pending_approval'::text, 'product_update'::text,
    'offer_received'::text, 'offer_agreed'::text, 'offer_countered'::text,
    'offer_withdrawn'::text, 'offer_expiring_soon'::text, 'offer_auto_completing_soon'::text,
    'offer_expired'::text, 'like'::text, 'admin_item_edit'::text, 'onboarding_list_prompt'::text,
    'group_invite'::text, 'group_invite_accepted'::text, 'group_invite_declined'::text,
    'group_ownership_transferred'::text, 'group_deleted'::text, 'group_member_removed'::text,
    'group_joined_via_link'::text, 'group_moderator_assigned'::text, 'group_moderator_removed'::text
  ]));
