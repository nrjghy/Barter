# Barter App

## Project Overview

Barter is a hyperlocal, community-oriented item-exchange platform for a 10-15
person invite-only pilot in Poland. Users list items and swap them in person —
no cash involved. The app is on `phase1-rewrite`, a major-version rewrite of
an earlier build: a 3-tab nav shell (Discover / My Stuff / Chat), a
user-to-user connection model replacing the old item-to-item match model, and
a "Mark Trade Complete" flow with a dispute window and post-trade reviews.

Notes on legacy documentation: older docs mention a Carousell scraper/importer.
The current codebase does not include an active scraper. Items do support a
`sourceUrl` field, and the UI displays an "Original Listing" link when present.

## Documentation

- [Barter_PRD.md](https://docs.google.com/document/d/1vLjqpV63emsLzZbJT6DLrNTYf9RrtzGjWQk_IC6_yoA/edit?usp=drive_link) — product spec, source of truth for product decisions (Google Doc)
- [Barter_Project_Plan.md](https://docs.google.com/document/d/1unhiLtW5meonBfOgysJkmPZ2jJmM5MX2_dBEgixVaQU/edit?usp=drive_link) — execution tracker, source of truth for what's shipped vs. pending (Google Doc)
- [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) — container-view and connection-model ERD diagrams, for orientation

## Architecture

- Frontend: React + TypeScript, Vite, React Router, React Query, Tailwind CSS, Framer Motion
- Backend: Supabase project "Barter2" (Auth, Postgres, Storage, Edge Functions)
- Service layer: stateless TypeScript services in `src/services` with validation, typed results, and consistent error handling
- Auth state: centralized `AuthContext`, backfilled shortly after initial paint from the live `users` row (role, username, avatar, location) rather than only trusting signup-time JWT metadata. The `onAuthStateChange` listener defers that backfill via `setTimeout` rather than awaiting it inline, since the callback can fire synchronously inside supabase-js's own client-initialization chain (e.g. recovering a session from storage on first load) — an awaited call back into the client from inside it would deadlock against that same initialization. `ProtectedRoute` stashes the intended path in `sessionStorage` before bouncing an unauthenticated visitor to `/login`; `Login` and `AuthCallback` both consume it (`src/utils/redirectAfterLogin.ts`) on a successful sign-in, so a deep link lands where it was headed rather than always the default screen. `sessionStorage` rather than router state, since Google OAuth is a full-page redirect out and back, which router state doesn't survive.
- Connection model: a match is a user-to-user `connections` row, not an item pairing — `connection_item_interests` tracks which item pair(s) sparked it; for a giveaway interest `item_id_1` is null (the recipient has no reciprocal item). RPCs (`record_response_optimized`, `check_and_create_match`, `complete_trade`, `create_giveaway_connection`, `claim_giveaway_completion`, `approve_giveaway_completion`, `create_offer`, `accept_offer`, `withdraw_offer`, `counter_offer`, `create_curator_connection`) handle the flows that need to write across both participants' rows, since RLS scopes updates to each user's own data. `complete_trade` and `create_offer`/`counter_offer` each delegate their core logic to an internal, non-client-callable function (`_complete_trade_core`, `_offer_create_core`) rather than duplicating validation across callers — `_complete_trade_core` is also called directly by the `autocomplete-agreed-offers-daily` cron job when an agreed offer's window lapses unconfirmed, and `_offer_create_core` is shared between `create_offer` and the counter-offer path inside `counter_offer`. `create_giveaway_connection` and `create_curator_connection` similarly share their connection-bootstrap logic (sort the pair, find-or-create the `connections` row, dedupe into `connection_item_interests`) via an internal `_bootstrap_one_directional_connection` helper. A curator connection (gated on `users.is_curator`) never proceeds to an in-app trade — offer creation, trade completion, and giveaway-claim are all rejected server-side for it
- Storage: Supabase Storage for multi-image uploads; bucket from `VITE_SUPABASE_STORAGE_BUCKET` (defaults to `barter_user_item_media`)
- Analytics/monitoring: PostHog (product analytics, session recording) and Sentry (frontend errors/performance) — both no-op gracefully until real keys are configured. PostHog funnel events include `item_liked`/`item_passed` (with category and whether the item is curator-owned), `match_created`, `connection_created_curator`/`connection_created_giveaway` (alongside the existing generic `connection_created`, not replacing it), and `chat_first_message` (first non-system message in a connection, checked client-side against the already-loaded thread rather than a new query)
- Email: Resend, triggered via a `pg_net`-based Postgres trigger (`trigger_send_notification_email`) on `notifications` inserts — not a Supabase Database Webhook, that feature is unusable on this project (`supabase_functions` schema missing, confirmed via Dashboard error 3F000). The trigger checks `users.notification_preferences` (JSONB, `{"category": {"channel": bool}}`, structured per-channel so SMS/WhatsApp can be added as a new key later without a schema change) before firing, for five toggleable categories (`match`, `message`, `product_update`, `review_reminder`, `onboarding`); every other notification type always sends regardless of preference, since those are transactional/requires-action rather than engagement nudges. `send-notification-email` renders one shared HTML template for every type, a plain, near-text layout (no branded header, no button-styled CTA) rather than the original boxed/branded design, after live-testing found the boxed version landing in Gmail's Promotions tab even for a recipient with no prior history with the sending address. The CTA is a plain inline link driven by `data.actionPath`/`actionLabel`, present on 19 of 23 notification-creating functions as of an August 27 audit (2 are dead code with no call site, `notify_issue_status_change` has no user-facing destination to link to, `send_product_announcement` takes caller-supplied data per announcement). For the five toggleable categories, the trigger also passes a `category` field the Edge Function uses to attach a signed, RFC-8058-compliant `List-Unsubscribe` header (HMAC over `user_id:category`, keyed by the service role key, verified by a separate public `unsubscribe` Edge Function — no new secret needed). Two cron jobs feed into this: `send_onboarding_list_reminders` (three staged nudges at 72h/7d/14d after signup for users with zero listings, tracked via `users.onboarding_list_reminders_sent`) and `send_unread_message_reminders` (batches unread chat messages per connection into one email after 30 minutes unread, via `messages.email_notified_at`, deliberately not per-message).
- Location: reverse geocoding proxies Nominatim server-side via the `reverse-geocode` Edge Function, which also returns the ISO country code, used to derive `users.default_currency` via the `country-to-currency` package (see Data model below). Manual-entry autocomplete proxies LocationIQ via `places-autocomplete`, with an unfiltered/precise mode (`preciseLocation`) used only by chat's location-share picker — deliberately kept separate from the restricted default mode used for a user's own profile location. Both are server-side proxies since the underlying APIs require a server-held key/User-Agent the browser can't reliably provide.

Project structure (high level):

```
src/
├─ components/             # Presentational and composite UI
├─ contexts/               # Auth provider and context
├─ hooks/                  # React Query hooks that wrap services
├─ lib/                    # Supabase client, analytics, Sentry
├─ pages/                  # Route-level views
├─ services/               # Business logic (SOA) used by hooks/components
├─ types/                  # Generated/handwritten types
netlify/
├─ edge-functions/          # item-preview (migrated off Supabase Aug 27 — Supabase Edge Functions rewrite text/html responses to text/plain on GET, which silently broke its redirect)
public/
├─ invite.html              # static, unauthenticated share page for email invites (Web Share API + clipboard fallback)
supabase/
├─ functions/               # Edge functions (send-notification-email, unsubscribe, reverse-geocode, places-autocomplete)
├─ migrations/              # SQL migrations
```

### Data model highlights

- Items include: `image_urls` (TEXT[]), `source_url`, `status` (`active` / `cancelled` / `traded` / `expired`, kept in sync with the legacy `is_active` flag), `listing_type` (`trade` / `giveaway`, set at creation and not editable afterward — see Pages below), `estimated_value` (always 0 for giveaways, exempt from `get_items_browse`'s min/max value filters), `value_currency` (defaults from the lister's `users.default_currency`, itself derived from location's country code, but changeable per listing — see AddEditItem.tsx below), timestamps, and `user_id`
- `image_urls` ordering is meaningful, not just upload order: index 0 is the primary photo, shown as the thumbnail everywhere the item is listed. User-selectable via a star action in `AddEditItem.tsx`'s photo picker, which reorders the array rather than storing a separate flag
- `offers` / `offer_items`: structured trade negotiation records on a connection, alongside free-form chat rather than replacing it. Status lifecycle `pending` → `agreed` → `completed` (or `superseded` / `withdrawn` / `expired`), with only one `pending` offer allowed per connection (`offers_one_pending_per_connection`, a partial unique index on `connection_id` `WHERE status = 'pending'`). An item committed to a currently-`agreed` offer is excluded from `get_items_browse`'s Discover results, and rejected by `create_offer`/`counter_offer` if selected for a new offer — both checks are computed live from `offer_items`/`offers`, not a stored flag
- `items.latitude`/`longitude` are NOT NULL, backed by a `populate_item_location` trigger that fills them from the owner's own location at insert time whenever a caller doesn't supply them directly. Every item is guaranteed to have a location; the radius filter depends on this entirely. `items.location` (text) is now also populated per item — backfilled once from the owner's `users.location` for pre-existing rows, defaulting to the owner's profile location at creation, and editable per item afterward via `AddEditItem.tsx`
- `connections` (`user_id_1` < `user_id_2` by constraint, `status`: `active` / `ended`), `connection_item_interests`, `connection_reads` (drives the Chat list's "New" marker) replace the old `matches`/`swipes` tables, which no longer exist in the live database
- `trade_completions` / `trade_completion_items` capture what was actually exchanged when a trade is marked complete, including the 7-day dispute window (`disputed_at`, `dispute_deadline`). `status` (`completed` / `pending_approval` / `approved` / `superseded`) plus `approved_at`/`approved_by` support the giveaway two-step completion model — a regular trade goes straight to `completed`; a giveaway claim starts `pending_approval` and only becomes `approved` (with `dispute_deadline` reset to start from that moment, not the claim) once the lister approves. A `pending_approval` claim beaten by another approved claim on the same item becomes `superseded`, with its own notification wording distinct from the generic "item unavailable" case. `auto_completed` distinguishes a self-reported completion (`complete_trade`) from a system auto-completion after an agreed offer's window passes with no action (the `autocomplete-agreed-offers-daily` cron calling `_complete_trade_core` directly) — the dispute rule differs accordingly: only the non-completer can dispute a manual completion, but either participant can dispute an auto-completion, since `completed_by` is an arbitrary attribution (the offer's `proposed_by`) rather than a real claim that someone confirmed it happened.
- `messages.message_type`: `text` / `photo` / `location` / `system` — `system` is reserved for server-inserted messages (e.g. the Mark Trade Complete confirmation)
- `notifications.type` includes `product_update`, a broadcast type sent to every real (non-system, non-demo) user via the admin-only `send_product_announcement(title, content, data)` RPC — backend-only, not wired into any console UI, same pattern as `admin_delete_user`/`admin_update_item_category` below. Also includes `like` (a reciprocity nudge to an item's owner when someone likes it who hasn't been liked back yet — guarded against re-notifying a duplicate call, but a genuine undo-then-relike does notify again, that's treated as intentional, see the migration comment in `20260818134529_reciprocity_like_notification.sql`) `admin_item_edit` (sent to a listing's owner when an admin edits it, with an actual diff of what changed, not a generic message — skipped if nothing changed or if the admin edited their own listing), and `onboarding_list_prompt` (the three-stage "list your first item" nudge, see Email above)
- `users.notification_preferences` (JSONB) gates email delivery for the five toggleable categories (see Email above). `messages.email_notified_at` tracks which unread messages have already triggered a reminder email, separate from `is_read`/`read_at` (which reflect actual in-app reading via `markMessagesAsRead`) — a message can be read before or after its reminder fires, and either order is handled correctly, an already-read message is simply skipped by the reminder cron regardless of how long it's been unread
- `issues` (in-app bug/issue reports, separate from item/user reports), `app_settings` (tunable config, e.g. the daily like limit), `login_history` (data capture only — no user-facing screen yet, per Phase 1 scope)

## Frontend

### Navigation

Three bottom-nav tabs — Discover, My Stuff, Chat — shown only on their three
top-level routes (`Layout.tsx` renders the persistent header/bottom nav there,
a shared `BackBar` everywhere else). Profile lives behind the header avatar;
the Admin console is reached from Profile's settings menu, not a nav tab.

Every protected route also passes through a location gate in
`ProtectedRoute.tsx`: if `user.latitude` is null, it renders `LocationPrompt`
(GPS or a neighbourhood-level manual search, no skip option) instead of the
requested page. This is enforced globally, not per-page, so it can't be
bypassed by navigating directly to any route.

### Pages

- `Discover.tsx`: the browse/response experience, with the full filter set (category, condition, radius, value range, listing age, rating) wired to `get_items_browse`; giveaway items show a badge and are exempt from the value filters. Ranking orders results by distance from the viewer (equirectangular approximation, no PostGIS) with an owner-spread round-robin (`row_number() over (partition by user_id order by distance, created_at desc)`, ranked tier first, then distance, then recency) so one owner's items can't fill consecutive cards — this also dilutes the curator account's ~100 items automatically, no separate cap needed. Items with no location, or when the viewer has none, fall back to recency ordering
- `MyStuff.tsx`: the user's listings hub — add-listing entry point, All/Active filter, status badges, share, cancel, and Relist (Cancelled/Traded/Expired rows only — creates a new listing pre-filled from the old one via `location.state`, original row untouched)
- `AddEditItem.tsx`: create/edit items with validation and multi-image upload; a listing-type toggle (Trade/Giveaway) is interactive on create and read-only on edit (`listing_type` is immutable after creation — see Data model above), with Estimated Value hidden entirely for giveaways. A currency dropdown next to Estimated Value defaults from the user's `defaultCurrency` on create, or the existing/relisted item's own `valueCurrency` on edit/relist. Navigating directly to `/edit/:itemId` for a cancelled, traded, or expired item shows a Relist prompt instead of the edit form — the route itself is guarded, not just MyStuff's own menu (which already hides Edit for non-active items). The photo picker supports choosing a primary photo — a star action on any thumbnail reorders it to index 0 (see `image_urls` ordering above) — and auto-compresses (client-side canvas downscale + re-encode, no new dependency) any picked photo over the 5MB cap instead of rejecting it outright, since iOS Safari's HEIC→JPEG transcode at pick time can push an originally-under-cap photo over it. A per-item location field uses the same places-autocomplete pattern as `Profile.tsx`'s own location editor, defaulting to the owner's profile location
- `ItemDetail.tsx`: item details, images, share, a giveaway badge, the "Original Listing" link (from `sourceUrl`) when present, and the estimated value shown as `{value} {currency}` (e.g. "350 PLN") rather than a hardcoded "$". The item's own location now displays alongside these fields. The seller's name is tappable, navigating to `UserListings.tsx`
- `UserListings.tsx`: `/user/:userId`, a read-only view of another user's active listings, reached by tapping a seller's name on Item Detail. A mutually-blocked relationship renders the exact same empty state as a genuine zero-listings user — no distinct "you're blocked" messaging, matching how Block behaves everywhere else in the app
- `Chat.tsx`: connection list — item-context line, last-message preview, "New" marker for unopened connections
- `ChatThread.tsx`: a single thread — text/photo/location message bubbles, a composer for all three, and a "···" menu (Mark Trade Complete, Claim giveaway — shown when the connection has an unclaimed giveaway item, Block, Report). Location sharing opens `LocationSharePicker` (current location, or search-and-pick a named place via `places-autocomplete`); a searched place's name renders in the bubble in place of raw coordinates. The recipient's claim posts a system message with an Approve action for the lister, reusing the same tradeCompletionId-keyed pattern already used for trade disputes. Connection formation (both `check_and_create_match` and `create_giveaway_connection`) now also posts an opening system message into the thread, covering both new and reused connections. The item-context line in the header (`BackBar`'s `subtitle`, widened to accept a `ReactNode` rather than only a string) is tappable per item, navigating to `/item/:id`; for a connection referencing multiple items, each is independently tappable. Offer-related system messages render as inline cards (`OfferMessage`) with an item breakdown and, for the pending offer's recipient only, Accept/Modify actions; a persistent pinned strip (`AgreedOfferStrip`) sits above the composer whenever the connection has an `agreed` offer, showing a countdown to auto-complete plus Confirm Now (pre-fills `MarkTradeComplete.tsx`'s picker) and Withdraw (its own confirmation sheet). The composer's 🤝 button opens `OfferComposer.tsx` and disables itself while the connection already has an active offer. For a curator connection, the Propose-a-trade button, Mark Trade Complete, and Claim giveaway are all hidden and a banner is shown instead, and the automated first message renders as a tappable external-listing card (`CuratorListingMessage`, same convention as `OfferMessage`)
- `OfferComposer.tsx`: the item picker for proposing a new trade offer or countering an existing pending one — one file handles both modes, distinguished via route state (`counterOfferId`) rather than two separate screens. Redirects back to the chat thread with a toast if the connection is with the curator account, rather than only having its entry point hidden in ChatThread
- `MarkTradeComplete.tsx`: select which items on each side were exchanged and confirm, via the `complete_trade` RPC. When reached via the pinned strip's Confirm Now, the picker pre-fills both sides from the agreed offer's items — a starting point, not binding, so every item stays fully checkable/uncheckable before confirming. Redirects back to the chat thread with a toast if the connection is with the curator account, rather than only having its entry point hidden in ChatThread
- `ReviewWrite.tsx`: post-trade review screen at `/trade-completion/:tradeCompletionId/review`, surfaced by the review-reminder notification after the dispute window closes
- `Profile.tsx`: stats (items, trades completed, average rating), reviews received, settings menu
- `Account.tsx`: danger-zone screen — account deletion with confirmation
- `AccountDeleted.tsx`: standalone post-deletion confirmation screen (outside `ProtectedRoute`, since the session is already cleared by the time it renders)
- `AdminDashboard.tsx`: admin-only console with tabs for Listings, Reports, Issues, Category Suggestions, Disputes, and Users, queried directly against Supabase tables under admin-read RLS policies (horizontally scrollable tab strip on narrow viewports). Reports/Issues/Category Suggestions/Disputes remain read-only raw views for Phase 1 (no resolve/dismiss actions yet). Listings: Edit opens a full edit form covering every field the owner themselves can edit via `AddEditItem.tsx` (`admin_update_item`), except `listing_type`, which stays locked for admin too, same as for owners; the owner is notified with a real diff of what changed. Delete opens a confirm-then-cancel modal calling `admin_cancel_item`, which cancels the listing and notifies connected users the same way the owner's own cancel flow does, not a row deletion. Clicking a user row on the Users tab jumps to Listings pre-filtered to that user's items (all statuses, not just active), with a dismissible filter chip. Users: search/paginated list (`admin_list_users`, includes a signup-provider badge read from `auth.users.raw_app_meta_data->>'provider'`, distinct from the `providers` array which can include providers linked later, and both signup and last-sign-in as full timestamps) with per-row Reset Password (reuses the existing `resetPasswordForEmail` flow), Suspend/Unban (`admin_set_user_banned`, sets `auth.users.banned_until` directly, fully reversible, no data touched), Delete (`admin_delete_user`, the anonymize-and-remove-credential pattern, not a hard delete — same reasoning as `delete_own_account` above, blocked if the target is still admin-flagged, demote first), and Promote/Demote (`admin_set_user_role`). All four destructive/role actions reject the caller acting on their own row, both client-side and inside each RPC.
- `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthCallback.tsx`: auth flows

### Components (selected)

- Layout/nav: `Layout`, `Header`, `BackBar` (fixed-position, all 10 detail/task screens using it carry matching top padding; `subtitle` accepts a `ReactNode`, not just a string, so ChatThread can render tappable item links there), `BottomNavigation`, `LoadingSpinner`, `StatsCard`
- Items/response: `SwipeCard`, `SwipeInterface` (also owns the empty state's context-aware action: "Load More Items" while paginated results remain, "Check for new listings" once genuinely exhausted, calling `refetch` rather than `fetchNextPage`), `SwipeControls` (Not-for-me/Undo/Like/Filter — no longer has a persistent Refresh action, that moved into SwipeInterface's empty state since it had no real purpose mid-browse), `SwipeCounter`, `ItemStatus`, `CategoryFilter` (also has an "include unrated sellers" toggle, independent of the rating slider's own position)
  (these gesture-layer names — `SwipeCard`/`SwipeInterface`/`SwipeControls`/`SwipeCounter`, and the `onSwipe` prop — are intentionally unchanged; only the data layer was renamed swipe→response)
- Dialogs: `IssueReportDialog` (wired up, reachable from `Header`'s help icon), `NotificationCenter` (auto-marks-read on open, tap-to-navigate on connection-related types; `product_update` is a plain non-navigating broadcast type), `LocationSharePicker` (current location or search-and-pick a place, unfiltered/precise results, see Location above)
- Guidance: `InfoTooltip` (viewport-clamped info popover, 12 placements across the app), `OnboardingHint` (one-time dismissible per-tab orientation hint, tracked server-side)
- `LocationPrompt`: the mandatory-location gate's UI (GPS or manual search, no skip option), rendered by `ProtectedRoute` when a user has no location yet — see Navigation above
- Auth: `OAuthProviderButton` (Google, Facebook, Apple)

### Context

- `contexts/AuthContext.tsx` provides shared auth state with an `initialized` gate. `hooks/useAuth.ts` re-exports the hook.

### Hooks (selected)

- `useItems.ts`: infinite scrolling via React Query with filters (`categories`, `conditions`, `excludeUserId`, radius, value range, age, rating), plus `useUserItems(userId)` for another user's active listings
- `useResponses.ts`: records likes/passes via `ResponseService`, tracks the daily like limit and responded items, and supports a real server-side undo
- `useConnections.ts`: wraps `ConnectionService` for the Chat list and thread
- `useOffers.ts` (also exports `useOffersByIds`), `useTradeCompletions.ts`, `useMessages.ts`, `useReports.ts`, `useReviews.ts`, `useUserBlocks.ts`: feature-specific data hooks backed by services
- `useNotifications.tsx`: polls every 5s (was 15s). Also exports `useNotificationToasts`, which surfaces a toast on a genuinely new notification — seeded from whatever's already unread on first load, so it doesn't toast the existing backlog or re-fire on every poll

### Services

- `config.ts`, `types.ts`, `validation.ts`: shared business rules, types (`ServiceResult<T>`, etc.), and input validation
- `itemService.ts`: item CRUD, filtering (via `get_items_browse`), pagination, cancel
- `responseService.ts`: records likes/passes via `record_response_optimized`, which branches into a background match check (`check_and_create_match`) or, for a giveaway item, a background connection creation (`create_giveaway_connection`), or, for a curator-account item, a background connection creation (`create_curator_connection`) — the frontend just checks which flag came back, `matchCheckNeeded`, `giveawayConnectionNeeded`, or `curatorConnectionNeeded`. Plus server-side undo
- `connectionService.ts`: connection list/detail/read-state for the connection model. For a giveaway interest (`item_id_1` null), the usual mine/theirs ownership matching can't apply — there's a dedicated branch so the item still surfaces correctly in the recipient's Chat list and thread header. `ConnectionUserSummary` also carries `isCurator`, read off the joined `users` row
- `messageService.ts`: text/photo/location/system messages, polling-based
- `tradeCompletionService.ts`: wraps `complete_trade`, plus the giveaway completion pair `claimGiveawayCompletion`/`approveGiveawayCompletion` (`claim_giveaway_completion`/`approve_giveaway_completion`)
- `offerService.ts`: wraps `create_offer`/`accept_offer`/`withdraw_offer`/`counter_offer` plus `getCurrentOfferForConnection`/`getOffersByIds`, same two-layer error-handling convention (client/network error vs. the RPC's own rejected-but-reachable result) as `tradeCompletionService.ts`
- `reviewService.ts`: reviews keyed to `trade_completion_id`
- `accountService.ts`: wraps `delete_own_account`
- `issuesService.ts`: in-app issue/bug reports
- `notificationService.ts`, `reportService.ts`, `userService.ts`, `storageService.ts`: notifications, item/user reports, user profile, and multi-image/message-image upload to Supabase Storage

## Authentication System

### Complete Auth Features

- **User Registration**: email/password signup with username and optional location
- **User Login**: email/password authentication with OAuth
- **Email Verification**: required for new accounts, with resend
- **Password Reset**: full flow via email
- **Password Change**: in-profile, via `Profile.tsx`'s modal
- **Account Deletion**: `Account.tsx`'s danger zone → `delete_own_account` RPC, which anonymizes the profile and cancels active listings rather than hard-deleting the row (so the other side of any connection/trade/review keeps resolving correctly)
- **Session Management**: persistent auth with route protection via `ProtectedRoute`
- **Login history**: signup/login events are captured server-side (`login_history` table); no user-facing screen yet — that's Phase 2

### Password Reset Flow

1. **Forgot Password** (`/forgot-password`): user enters email to request reset
2. **Email Delivery**: Supabase sends a secure reset link
3. **Reset Password** (`/reset-password`): user sets a new password via the link
4. **Success**: redirect to login

### OAuth Providers

- Google is the only provider shown in the Login/Register UI for now — configured and working (Client ID/Secret set in Supabase's Auth Providers dashboard, tested end to end)
- Facebook and Apple support exists in the code (`OAuthProviderButton`, `AuthContext`) but their buttons are deliberately removed from `Login.tsx`/`Register.tsx` for the pilot — Facebook would need Meta Business Verification to serve anyone beyond manually-added Testers, which doesn't fit a no-business-entity community app; Apple would need a paid Developer Program enrollment and Apple Developer Portal setup. Both are easy to re-add (just re-insert the `OAuthProviderButton` block) if that changes later.

## Setup

### Environment variables

See `.env.example` in the repo root for the required variable names (never commit actual values). At minimum, the app needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_STORAGE_BUCKET`. Analytics/monitoring are optional and no-op cleanly if unset: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_SENTRY_DSN`.

### Database migrations

Migrations live under `supabase/migrations` and apply via the Supabase CLI or dashboard SQL editor.

### Supabase Storage

The Storage bucket is set by `VITE_SUPABASE_STORAGE_BUCKET` (default `barter_user_item_media`).

### OAuth

See "OAuth Providers" above for current per-provider status.

## Pending Tasks

Per `Barter_Project_Plan.md`, the rewrite itself is code-complete for Phase 1
scope. What's left:

- **Trade-offer flow verification**: create/accept/counter/withdraw, the composer's disabled-while-an-offer-exists guard, and notification tap-through have been verified at the code level and against live Supabase data, but not yet via a real two-account browser click-through end to end.
- **Stale free-chat connections**: a broader problem was identified but deliberately not solved here — connections that never use the offer feature at all (negotiated and completed entirely in free-form chat) have no signal to time out from, unlike an agreed offer's auto-complete window. A lighter follow-up was proposed: a soft "did this happen?" nudge on old connections with message activity but no completion record after a longer horizon — not built, just flagged for a later pass.

Everything else — the connection model, Chat, Mark Trade Complete, account
deletion, in-app issue reporting, the admin console tabs, the daily like
limit, filters, the visual reskin, PostHog/Sentry analytics, Google OAuth,
giveaway listings, connection-creation system messages, info-icon tooltips,
the onboarding tour, and location sharing (current location or a searched
place) — is built, configured, and verified against the live Barter2
database.
