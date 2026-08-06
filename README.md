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
- Auth state: centralized `AuthContext`, backfilled shortly after initial paint from the live `users` row (role, username, avatar, location) rather than only trusting signup-time JWT metadata
- Connection model: a match is a user-to-user `connections` row, not an item pairing — `connection_item_interests` tracks which item pair(s) sparked it. RPCs (`record_response_optimized`, `check_and_create_match`, `complete_trade`) handle the flows that need to write across both participants' rows, since RLS scopes updates to each user's own data
- Storage: Supabase Storage for multi-image uploads; bucket from `VITE_SUPABASE_STORAGE_BUCKET` (defaults to `barter_user_item_media`)
- Analytics/monitoring: PostHog (product analytics, session recording) and Sentry (frontend errors/performance) — both no-op gracefully until real keys are configured
- Email: Resend, triggered by a Supabase Database Webhook on `notifications` inserts, via the `send-notification-email` Edge Function
- Location: reverse geocoding and manual-entry autocomplete both proxy LocationIQ server-side via Edge Functions (`reverse-geocode`, `places-autocomplete`), since the underlying APIs require a server-held key/User-Agent the browser can't reliably provide

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
supabase/
├─ functions/               # Edge functions (item-preview, send-notification-email, reverse-geocode, places-autocomplete)
├─ migrations/              # SQL migrations
```

### Data model highlights

- Items include: `image_urls` (TEXT[]), `source_url`, `status` (`active` / `cancelled` / `traded` / `expired`, kept in sync with the legacy `is_active` flag), `estimated_value`, `value_currency`, timestamps, and `user_id`
- `connections` (`user_id_1` < `user_id_2` by constraint, `status`: `active` / `ended`), `connection_item_interests`, `connection_reads` (drives the Chat list's "New" marker) replace the old `matches`/`swipes` tables, which no longer exist in the live database
- `trade_completions` / `trade_completion_items` capture what was actually exchanged when a trade is marked complete, including the 7-day dispute window (`disputed_at`, `dispute_deadline`)
- `messages.message_type`: `text` / `photo` / `location` / `system` — `system` is reserved for server-inserted messages (e.g. the Mark Trade Complete confirmation)
- `issues` (in-app bug/issue reports, separate from item/user reports), `app_settings` (tunable config, e.g. the daily like limit), `login_history` (data capture only — no user-facing screen yet, per Phase 1 scope)

## Frontend

### Navigation

Three bottom-nav tabs — Discover, My Stuff, Chat — shown only on their three
top-level routes (`Layout.tsx` renders the persistent header/bottom nav there,
a shared `BackBar` everywhere else). Profile lives behind the header avatar;
the Admin console is reached from Profile's settings menu, not a nav tab.

### Pages

- `Dashboard.tsx`: Discover — the browse/response experience, with the full filter set (category, condition, radius, value range, listing age, rating) wired to `get_items_browse`
- `MyStuff.tsx`: the user's listings hub — add-listing entry point, All/Active filter, status badges, share, cancel
- `AddToy.tsx`: create/edit items with validation and multi-image upload
- `ItemDetail.tsx`: item details, images, share, and the "Original Listing" link (from `sourceUrl`) when present
- `Chat.tsx`: connection list — item-context line, last-message preview, "New" marker for unopened connections
- `ChatThread.tsx`: a single thread — text/photo/location message bubbles, a composer for all three, and a "···" menu (Mark Trade Complete entry point, Block, Report)
- `MarkTradeComplete.tsx`: select which items on each side were exchanged and confirm, via the `complete_trade` RPC
- `ReviewWrite.tsx`: post-trade review screen at `/trade-completion/:tradeCompletionId/review`, surfaced by the review-reminder notification after the dispute window closes
- `Profile.tsx`: stats (items, trades completed, average rating), reviews received, settings menu
- `Account.tsx`: danger-zone screen — account deletion with confirmation
- `AccountDeleted.tsx`: standalone post-deletion confirmation screen (outside `ProtectedRoute`, since the session is already cleared by the time it renders)
- `AdminDashboard.tsx`: admin-only console with tabs for Listings, Reports, Issues, Category Suggestions, and Disputes — all read-only raw views for Phase 1 (no resolve/dismiss actions yet), queried directly against Supabase tables under admin-read RLS policies
- `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthCallback.tsx`: auth flows

### Components (selected)

- Layout/nav: `Layout`, `Header`, `BackBar`, `BottomNavigation`, `LoadingSpinner`, `StatsCard`
- Items/response: `EnhancedItemCard`, `ItemCard`, `SwipeCard`, `SwipeInterface`, `SwipeControls`, `SwipeCounter`, `ItemStatus`, `CategoryFilter`
  (these gesture-layer names — `SwipeCard`/`SwipeInterface`/`SwipeControls`/`SwipeCounter`, and the `onSwipe` prop — are intentionally unchanged; only the data layer was renamed swipe→response)
- Dialogs: `IssueReportDialog` (wired up, reachable from `Header`'s help icon), `NotificationCenter`
- Auth: `OAuthProviderButton` (Google, Facebook, Apple)
- Dead code, not wired up anywhere: `TradeOfferSelectionModal`, `ReviewDialog`

### Context

- `contexts/AuthContext.tsx` provides shared auth state with an `initialized` gate. `hooks/useAuth.ts` re-exports the hook.

### Hooks (selected)

- `useItems.ts`: infinite scrolling via React Query with filters (`categories`, `conditions`, `excludeUserId`, radius, value range, age, rating), plus `useUserItems(userId)` for another user's active listings
- `useResponses.ts`: records likes/passes via `ResponseService`, tracks the daily like limit and responded items, and supports a real server-side undo
- `useConnections.ts`: wraps `ConnectionService` for the Chat list and thread
- `useTradeCompletions.ts`, `useMessages.ts`, `useNotifications.ts`, `useReports.ts`, `useReviews.ts`, `useUserBlocks.ts`: feature-specific data hooks backed by services
- `useMatches.ts`: dead code — no remaining callers; the old `matches` table it queries no longer exists in the live database

### Services

- `config.ts`, `types.ts`, `validation.ts`: shared business rules, types (`ServiceResult<T>`, etc.), and input validation
- `itemService.ts`: item CRUD, filtering (via `get_items_browse`), pagination, cancel
- `responseService.ts`: records likes/passes via `record_response_optimized` (background match check via `check_and_create_match`), plus server-side undo
- `connectionService.ts`: connection list/detail/read-state, replaces `matchService.ts` for the connection model
- `messageService.ts`: text/photo/location/system messages, polling-based
- `tradeCompletionService.ts`: wraps `complete_trade`
- `reviewService.ts`: reviews keyed to `trade_completion_id`
- `accountService.ts`: wraps `delete_own_account`
- `issuesService.ts`: in-app issue/bug reports
- `notificationService.ts`, `reportService.ts`, `userService.ts`, `storageService.ts`: notifications, item/user reports, user profile, and multi-image/message-image upload to Supabase Storage
- `matchService.ts`: dead code, superseded by `connectionService.ts`

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

- **Email delivery (Resend)**: account created, sending domain verified, API key/from-address/`FRONTEND_URL` all set as Edge Function secrets — but the Supabase Database Webhook (table `notifications`, event `INSERT`, target `send-notification-email`) can't be created yet. Root cause: Barter2 was restored from a pg_dump backup, and the `supabase_functions` schema Database Webhooks depend on is platform-managed infrastructure, not part of a database dump, so it's missing entirely. A support ticket is filed with Supabase; nothing further to do here until that's resolved.

Everything else — the connection model, Chat, Mark Trade Complete, account
deletion, in-app issue reporting, the admin console tabs, the daily like
limit, filters, the visual reskin, PostHog/Sentry analytics, and Google OAuth
— is built, configured, and verified against the live Barter2 database. Two
known Phase 1 design polish items from QA are still open (a toast overlapping
a button on My Stuff, a notification timestamp sort bug) — see `CLAUDE.md`.
