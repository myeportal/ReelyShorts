# Supabase wiring notes for REELY SHORTS

## What this handles
- auth and profiles
- show and episode metadata
- moderation-aware CMS data
- coin economy and rewarded-ad event storage
- watch progress and unlock history

## Still needed for live wiring
- project access to run `schema.sql`
- storage bucket plan for uploads if using Supabase storage first
- anon key and URL in `.env`
- service role key kept server-side only for privileged operations

## Upload guidance
For direct uploads up to 1.3GB:
- use signed upload URLs
- validate MIME type and file size server-side
- store metadata in `video_assets`
- keep moderation status in `draft` or `review` until approved

## Recommended backend split
- frontend: Vite + React
- auth/db: Supabase
- admin moderation: Supabase tables + policies
- rewarded ads: provider callback -> verification endpoint -> `ad_reward_events`
- uploads: Supabase storage initially, abstracted so Cloudflare R2 can replace it later
