# REELY SHORTS — Implementation Plan

## Phase 1
- create React frontend shell
- build branding and splash/home experience
- create sample catalog, episodes, locked/unlocked UX
- add coin balance and rewarded-ad prompt UX
- wire Supabase client configuration

## Phase 2
- create SQL/schema for profiles, shows, episodes, unlocks, ad rewards
- implement backend-safe coin grant flow design
- implement progress tracking and episode unlock rules

## Phase 3
- add placeholder assets and image slots
- prep GitHub + Vercel deployment flow
- replace placeholders with final branding/assets

## Notes
- Live ad serving should remain behind an adapter so providers can be swapped later.
- Coin grants should be verified server-side, not issued directly from the client.
- Video storage can start on Supabase and be abstracted for R2 later.
