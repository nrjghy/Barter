-- Groups feature: notification types. Six total across the whole
-- feature, more than the two originally spec'd -- group_invite_declined
-- was extended to notify the inviter too (matching the accept case),
-- group_ownership_transferred and group_deleted and
-- group_member_removed cover interactions not originally described.

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['match'::text, 'message'::text, 'trade_completed'::text, 'review'::text, 'system'::text, 'item_unavailable'::text, 'review_reminder'::text, 'issue_status'::text, 'admin_daily_summary'::text, 'trade_dispute'::text, 'listing_expiry_reminder'::text, 'pending_approval'::text, 'product_update'::text, 'offer_received'::text, 'offer_agreed'::text, 'offer_countered'::text, 'offer_withdrawn'::text, 'offer_expiring_soon'::text, 'offer_auto_completing_soon'::text, 'offer_expired'::text, 'like'::text, 'admin_item_edit'::text, 'onboarding_list_prompt'::text, 'group_invite'::text, 'group_invite_accepted'::text, 'group_invite_declined'::text, 'group_ownership_transferred'::text, 'group_deleted'::text, 'group_member_removed'::text]));
