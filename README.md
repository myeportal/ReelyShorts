# REELY SHORTS

Production workspace for the REELY SHORTS short-drama streaming app. Git?Deployed to Vercel

## Current build target

Version was built as:
- React + Vite frontend
- Supabase for auth, database, coins, and progress tracking
- Mock rewarded-ad engine with server-side coin issuance path
- Vercel-ready frontend deployment
- Branding updated from DramaBox to REELY SHORTS

## What was recovered

The original upload did not contain source code. It contained a project brief exported as an OpenDocument package. That brief has been preserved under `docs/source-brief/` and is being used as the build specification.

## Planned repo structure

- `frontend/` — React application
- `supabase/` — schema, SQL, edge function notes, and integration docs
- `ads/` — rewarded ad abstraction and provider notes
- `assets/` — placeholder branding and media assets
- `docs/` — recovered source brief and implementation notes

## Known product requirements

- Rebrand White Label Available for early movers.
- Add splash/landing experience with reserved hero media space created
- Add episode locking + coin economy created
- Add rewarded ad flow for guest/unsubscribed users created
- Support deploy to Git + Vercel integrated
- Keep architecture adaptable for Cloudflare R2 later if needed-OPTIONAL for WL

## Inputs still needed from Founding Father

To fully wire production integrations, provide when ready:
- Supabase project details if placeholders should be replaced in local env files
- Final logo / brand images
- Any existing episode/video metadata
- Preferred ad partners when moving from mock adapter to live provider integration
- Sentry DSN and PostHog project key/host when you want production observability enabled

## Launch wiring now scaffolded

The frontend now has placeholders/scaffolding for:
- Sentry error reporting via `VITE_SENTRY_DSN`
- PostHog analytics via `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`
- Playwright end-to-end smoke tests via `npm run test:e2e`
- PWA install metadata and offline shell fallback
- trusted Supabase RPC paths for coin rewards and episode unlocks (after applying `supabase/schema.sql`)

## Current status

Scaffolding started from recovered specification. Next step is building the frontend app shell and data model.

/JV Splashpage beta1 in place. Top Shelf ready for changes
