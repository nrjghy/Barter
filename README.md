# Barter

A hyperlocal item-exchange marketplace. People list things they no longer need and swap them in person with neighbours. No cash changes hands.

Barter is currently an invite-only pilot in Warsaw. I am building it end to end as the founder and sole product owner, and writing up the decisions as I go in the [build log](https://neerajgoswami.substack.com/s/barter).

## What it does

- **Discover:** browse nearby listings, filter by distance, category and condition, then like or pass
- **Connections:** a mutual like opens a connection between two people, with chat and meetup location sharing
- **Offers:** propose, counter or accept a structured trade inside the chat, alongside free-form conversation
- **Trade completion:** mark a trade complete, with a dispute window and post-trade reviews
- **Groups:** closed, invite-only circles such as a building, an office or a friend group. A listing can be public and shared to several groups at once
- **Giveaways** as well as trades

## Design decisions

Each of these has a write-up in the build log.

- **Location:** a profile shows a city name only. An exact pin exists only inside a chat, shared by choice with someone you are already trading with. ([Location capture](https://neerajgoswami.substack.com/p/location-capture))
- **Groups:** closed by design, with no directory and no search. Public and group visibility are linked so a listing can never end up visible to no one. ([Groups](https://neerajgoswami.substack.com/p/groups-trading-in-a-circle-of-trust))
- **Errors:** database errors are reported to Sentry automatically. Users see a readable message with a Report option tied to the same error ID. ([Error handling](https://neerajgoswami.substack.com/p/error-handling))
- **Analytics:** PostHog funnels for browsing to trade and for posting a listing, plus session recording. A feature is not done until its key actions are tracked. ([Analytics](https://neerajgoswami.substack.com/p/analytics))

## Stack

- Frontend: React, TypeScript, Vite, React Query, Tailwind CSS and Framer Motion
- Backend: Supabase (Auth, Postgres, Storage and Edge Functions) and Netlify edge functions
- Services: PostHog, Sentry and Resend
- Built with Claude Code

## Architecture in brief

- A stateless TypeScript service layer in `src/services` handles validation, typed results and consistent error handling
- Flows that write across both participants' data, such as matching, offers and trade completion, run as Postgres functions. Tables are protected with row level security
- Deeper notes on the data model, RPCs and past incidents are in [docs/ENGINEERING_NOTES.md](docs/ENGINEERING_NOTES.md)

## Running locally

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_STORAGE_BUCKET`. `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` and `VITE_SENTRY_DSN` are optional
2. `npm install`
3. `npm run dev`

Database migrations are in `supabase/migrations`.

## Status

The Phase 1 rewrite is code complete and live with the pilot group. Still open: an end-to-end two-account check of the trade offer flow.

## License

All rights reserved. The source is publicly viewable for portfolio and demonstration purposes only. See [LICENSE](LICENSE).
