# REELY SHORTS — RLS Audit Notes

## Objective
Lock down Supabase so public viewers can consume published content without gaining editorial or cross-user access.

## Risks found before hardening
- `shows` and `episodes` had only minimal published-read policies.
- `video_assets` had no explicit public-vs-staff separation.
- `profiles` needed a safe self-service bootstrap path for anonymous/authenticated users without letting them promote their own role or mint coins.
- `episode_unlocks` and `watch_progress` needed explicit own-row protections.
- the frontend hydration path fetched all video assets, which would conflict with a proper public policy model.
- rewarded-coin writes are still client-driven today, which is not production-safe for abuse prevention.

## Hardening implemented in repo
- added `public.is_staff()` helper for policy reuse
- added a `guard_profile_mutation` trigger to prevent viewers from changing their own `role` or `coin_balance`
- restricted editorial writes on `shows`, `episodes`, `video_assets`, and `audit_log` to staff
- restricted public reads to published `shows`, `episodes`, and `video_assets`
- restricted `profiles`, `episode_unlocks`, and `watch_progress` to own-row access (plus staff)
- restricted `ad_reward_events` insertion to staff-only paths
- added trusted RPC functions for `claim_rewarded_ad()` and `unlock_episode_with_coins()`
- added database-backed rate-limit windows for reward claims and episode unlocks
- updated frontend hydration to fetch **all assets only for staff**, and only **published assets** for viewers

## Still not production-complete
1. **Reward verification is still mocked**
   - rewards now go through a trusted RPC path, but the provider proof is still client-generated
   - production should replace the mock button path with provider callback verification
2. **Admin role assignment still requires out-of-band control**
   - staff should be provisioned by secure admin tooling or service-role workflows only
3. **Policies still need live pen-testing in Supabase**
   - validate anon/authenticated/staff tokens directly against REST and PostgREST endpoints
4. **Auth endpoint rate limiting is still external to Supabase schema**
   - database-side guards now cover reward and unlock abuse, but auth throttling still needs gateway/provider-level controls

## Recommended next security step
Apply the schema in Supabase, pen-test the RPC and policy paths live, then replace mock rewarded-ad verification with a provider-backed server callback.
