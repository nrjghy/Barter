# Barter App

## Project Overview

Barter is a modern item exchange platform built with React, TypeScript, and Supabase. Users can create items with multiple images, browse and swipe on items, form matches, chat, leave reviews, send reports, and receive notifications. The app uses a service-oriented architecture and React Query for scalable, typed, and testable data access.

Notes on legacy documentation: older docs mention a Carousell scraper/importer. The current codebase does not include an active scraper. Items do support a `sourceUrl` field, and the UI displays an "Original Listing" link when present.

## Architecture

- Frontend: React + TypeScript, Vite, React Router, React Query, Tailwind CSS, Framer Motion
- Backend: Supabase (Auth, Postgres, Storage, Edge Functions)
- Service layer: stateless TypeScript services in `src/services` with validation, typed results, and consistent error handling
- Auth state: centralized `AuthContext` with initialization gating to avoid race conditions and duplicate fetches
- Swipe performance: optimized RPCs (`record_swipe_optimized`, `check_and_create_match`) with automatic legacy fallback
- Storage: Supabase Storage for multi-image uploads; bucket from `VITE_SUPABASE_STORAGE_BUCKET` (defaults to `barter_user_item_media`)

Project structure (high level):

```
src/
├─ components/             # Presentational and composite UI
├─ contexts/               # Auth provider and context
├─ hooks/                  # React Query hooks that wrap services
├─ lib/                    # Supabase client
├─ pages/                  # Route-level views
├─ services/               # Business logic (SOA) used by hooks/components
├─ types/                  # Generated/handwritten types
supabase/
├─ functions/admin-listings/  # Edge function for admin listings
├─ migrations/               # SQL migrations
```

### Data model highlights

- Items include: `image_urls` (TEXT[]), `source_url`, `is_active`, `estimated_value`, `value_currency`, timestamps, and `user_id`
- UI exposes `sourceUrl` on `ItemDetail` when present

## Frontend

### Pages

- `AddToy.tsx`: Create items with validation and multi-image upload via `StorageService` and `ItemService`
- `AdminDashboard.tsx`: Admin-only listings view via Edge Function `functions/v1/admin-listings`
- `AuthCallback.tsx`: Handles OAuth callback
- `Dashboard.tsx`: Main browse/swipe experience; uses `useItems` with `excludeUserId: user?.id` and optimized swipe controls
- `ForgotPassword.tsx`: Password reset request form with email validation
- `ItemDetail.tsx`: Shows item details, images, and "Original Listing" link (from `sourceUrl`)
- `Login.tsx`, `Register.tsx`: Complete authentication flows with OAuth support
- `Matches.tsx`: Match list and actions
- `Messages.tsx`: Chat between matched users
- `Profile.tsx`: User profile, stats, and password management
- `ResetPassword.tsx`: Password reset confirmation and new password setup

### Components (selected)

- Layout/UI: `Header`, `DashboardHeader`, `BottomNavigation`, `LoadingSpinner`, `StatsCard`
- Items/swipe: `EnhancedItemCard`, `ItemCard`, `SwipeCard`, `SwipeControls`, `SwipeCounter`, `ItemStatus`
- Modals/dialogs: `TradeOfferSelectionModal`, `ReportDialog`, `ReviewDialog`, `NotificationCenter`
- Auth: `OAuthProviderButton`
- Filters: `CategoryFilter` exists but is commented out in `Dashboard`

### Context

- `contexts/AuthContext.tsx` provides a shared auth state with an `initialized` gate to ensure children render only after context setup. `hooks/useAuth.ts` re-exports the hook for backward compatibility.

### Hooks (selected)

- `useItems.ts`: Infinite scrolling via React Query with filters (`categories`, `conditions`, `excludeUserId`, etc.)
- `useSwipes.ts`: Records swipes via `SwipeService`, manages swiped items and counters
- `useMatches.ts`, `useMessages.ts`, `useNotifications.ts`, `useReports.ts`, `useReviews.ts`, `useUserBlocks.ts`: Feature-specific data hooks backed by services

### Services

- `config.ts`: Business rules, tables, channels, error codes/messages
- `types.ts`: Shared service types (`ServiceResult<T>`, `SwipeResult`, `ItemWithUser`, etc.)
- `validation.ts`: Input validation utilities (UUID, swipe direction, etc.)
- `itemService.ts`: Item CRUD, filtering, pagination, and field transformations
- `swipeService.ts`: Optimized `record_swipe_optimized` with legacy fallback; background match via `check_and_create_match`
- `matchService.ts`, `messageService.ts`, `notificationService.ts`, `reviewService.ts`, `reportService.ts`, `userService.ts`: Domain services with consistent error handling and types
- `storageService.ts`: Multi-image upload/delete to Supabase Storage; validates size/types; bucket via `VITE_SUPABASE_STORAGE_BUCKET` or default

## Authentication System

### Complete Auth Features

- **User Registration**: Email/password signup with username and optional location
- **User Login**: Email/password authentication with OAuth providers (Google, Facebook, GitHub)
- **Email Verification**: Required email verification for new accounts with resend functionality
- **Password Reset**: Complete password reset flow via email
- **Password Change**: In-profile password updates for logged-in users
- **Session Management**: Persistent authentication with proper route protection
- **OAuth Integration**: Social login with proper callback handling
- **Profile Management**: User profile updates and avatar support

### Password Reset Flow

1. **Forgot Password** (`/forgot-password`): Users enter email to request reset
2. **Email Delivery**: Supabase sends secure reset link to user's email
3. **Reset Password** (`/reset-password`): Users set new password via email link
4. **Success**: Automatic redirect to login with new credentials

### OAuth Providers

- Google, Facebook, and GitHub authentication
- Proper redirect handling and session management
- Seamless integration with existing auth system

## Setup

### Environment variables

Create a `.env` file with:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media
```

### Database migrations

Migrations are located under `supabase/migrations`. Apply them using Supabase CLI or the dashboard SQL editor as needed. For swipe performance, ensure the RPCs and indexes described in the swipe optimization guide are applied.

### Supabase Storage

Follow `SUPABASE_STORAGE_SETUP.md` to create and secure the bucket specified by `VITE_SUPABASE_STORAGE_BUCKET` (default `barter_user_item_media`).

### OAuth

Follow `OAUTH_SETUP_GUIDE.md` to configure Google, Facebook, and GitHub providers in Supabase.

## Pending Tasks

- Re-enable `CategoryFilter` in `Dashboard` (was commented out due to TS import issues)
- Standardize `ItemDetail` to use the service layer instead of direct Supabase querying
- Ensure optimized swipe RPCs (`record_swipe_optimized`, `check_and_create_match`) and indexes are deployed to unlock full performance
- Consider adding two-factor authentication for enhanced security
- Implement account deletion functionality with data cleanup
- Add login history tracking and suspicious activity detection
