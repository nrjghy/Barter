# Barter — Claude Code Context

## Project summary

Barter is a hyperlocal, community-oriented item-exchange platform for a
10-15 person invite-only pilot in Poland. Users swap goods in person, no
cash involved. Stack: React, TypeScript, Vite, Supabase.

## Where to look for context

Source of truth for product decisions and full spec:
`Barter_PRD.md` — https://docs.google.com/document/d/1vLjqpV63emsLzZbJT6DLrNTYf9RrtzGjWQk_IC6_yoA/edit?usp=drive_link

Source of truth for what's done vs. pending (execution tracker):
`Barter_Project_Plan.md` — https://docs.google.com/document/d/1unhiLtW5meonBfOgysJkmPZ2jJmM5MX2_dBEgixVaQU/edit?usp=drive_link

These are live Google Docs, not files in this repo. If you can't fetch
them directly in a given session, ask the person to paste the relevant
section instead of guessing at product intent.

## Current state

- Backend: existing Supabase project "Barter2" — schema, RLS policies,
  and Storage images restored and verified. Continuing with this
  project, not starting fresh.
- Branch: `phase1-rewrite` — a major-version rewrite, not an incremental
  patch. Use the existing code as reference/scaffolding, not something
  to edit in place piece by piece. Prefer clean, correct implementations
  over preserving legacy code paths or adding backwards-compatibility
  shims for the pre-rewrite version.
- Rewrite code ships incrementally on this branch; `Barter_Project_Plan.md`
  (linked above) is the source of truth for what's actually shipped vs.
  pending — don't infer shipped status from this file.
- Phase 1 design (Claude Design mockups) is approved for all screens.
  Two minor polish items are flagged for the QA pass, not yet fixed:
  a toast overlapping a button on My Stuff, and a notification
  timestamp sort bug.
- Required local `.env` variables: see `.env.example` in the repo root
  for names (never commit actual values)
- Backend also includes Supabase Edge Functions — currently one
  (`admin-listings`) in `supabase/functions/`. More may be added as
  email-sending and other server-side logic get built.

## Known issues to keep in mind while coding

- Two orphan database tables with no codebase references, both explicitly
  out of scope per PRD §6, candidates for removal: `system_item_interests`,
  `profile_views`. (`issues` was repurposed for in-app issue reporting and
  is fully wired up — `Header.tsx`, `IssueReportDialog.tsx`,
  `issuesService.ts`, `AdminDashboard.tsx` — no longer an orphan.)
- Dead `TradeOfferSelectionModal` component — unused

## What NOT to assume

- This file describes intent, not confirmed current app behavior. A
  separate QA pass compares the PRD against actual behavior — don't
  treat anything here as verified without that pass.
- This is Phase 1 pilot scope only. Do not build Phase 2 features even
  if they seem like natural extensions: web push, offline action-queueing,
  the full unified moderation inbox UI, rating-based filtering, the
  category-request moderation gate, or the "Pause" listing state.

## Hard rule

Never commit, paste, or otherwise place secrets (the DB password, API
keys, tokens) into code, commit messages, or chat. Secrets live only in
the local `.env` file or a password manager. This is a repeat of the
mistake that required rotating the Barter2 DB password once already.
