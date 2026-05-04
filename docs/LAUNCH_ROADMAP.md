# REELY SHORTS — Priority-Ranked Launch Roadmap

This turns items 33-51 into a shipping order instead of a flat wishlist.

## Phase 1 — Launch-safe foundation (do first)

### 1. Security and data access
1. **Audit and harden Supabase RLS**
   - public users can only read published shows, episodes, and video assets
   - viewers can only read/update their own profile, unlocks, and progress rows
   - staff-only access for moderation, audit, and editorial mutation
   - pen-test anon and authenticated access paths against the public API
2. **Add abuse controls / rate limiting**
   - auth attempts
   - rewarded-coin paths
   - purchase / unlock mutation paths
3. **Ship legal baseline**
   - Privacy Policy
   - Terms of Service
   - PIPEDA-aware disclosures for Canadian users
4. **Enable backups and recovery**
   - Supabase point-in-time recovery
   - backup/recovery runbook

### 2. Product observability
5. **Add analytics**
   - page/screen views
   - episode start/completion
   - unlock attempts
   - paywall views
6. **Add error monitoring**
   - Sentry frontend crash/error capture
7. **Add end-to-end tests**
   - guest auth
   - episode unlock
   - coin purchase happy path
8. **Run device QA**
   - iOS Safari
   - Android Chrome
   - narrow/tall viewport coverage

## Phase 2 — Beta operations
9. **Track core metrics**
   - DAU
   - retention
   - average watch time
   - coin conversion rate
   - ARPU
10. **Add uptime monitoring**
11. **Configure CDN caching**
12. **Add consent collection**
13. **Create DMCA / takedown process**
14. **Run a closed beta with 20-50 users**

## Phase 3 — Mobile packaging
15. **Wrap as a PWA**
   - manifest
   - service worker
   - install prompts
   - offline shell/fallback
16. **Add biometric login**
   - only after a packaged mobile path exists
17. **Build native wrappers if justified**
   - Capacitor first if the web app remains the source of truth
   - React Native only if native UX/platform APIs become a real product requirement
18. **Prepare App Store / Play Store submission assets**
19. **Load test the video pipeline before scale-up**

## Recommended implementation order for the next block
1. RLS audit + schema hardening
2. Sentry integration
3. Analytics events
4. Playwright scaffolding
5. PWA shell

## Notes
- **PWA before native** is the recommended path for this project because the product is already React + Vite + mobile-first.
- **Rate limiting and coin issuance** should move behind trusted server-side endpoints before public launch.
- **Biometric login** is not worth building until packaging strategy is settled.
