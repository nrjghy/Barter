# Barter

Barter is a hyperlocal item-exchange platform, currently piloting in Poland. Users list items,
swipe to browse and match with other users, chat, trade, and leave reviews. Built with React,
TypeScript, Vite, and Supabase (Auth, Postgres, Storage, Edge Functions).

## Backend

The backend is an existing Supabase project named **Barter2**. This repo's `supabase/` directory
(migrations, edge functions) targets that project — do not assume a fresh/empty database.

## Full product context

The full product spec and the project tracker live in Google Docs, **not** in this repo — there
are no local PRD or plan files to read. If you need spec details or current progress/priorities
to make a product or scope decision, ask the user to paste in the relevant PRD or plan section
directly into the chat.

## Current branch: phase1-rewrite

We are on a rewrite branch (`phase1-rewrite`). Treat this as a **major-version rewrite**, not a
series of incremental patches on the old app — prefer clean, correct implementations over
preserving legacy code paths or adding backwards-compatibility shims for the pre-rewrite version.

## Secrets

Never include secrets, connection strings, API keys, or Supabase service-role keys in this file
or in any commit. Use `.env` (gitignored) for local config — see `.env.example` for the required
variable names.
