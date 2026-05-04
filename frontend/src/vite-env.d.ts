/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_VIDEO_PROVIDER?: string
  readonly VITE_R2_PUBLIC_BASE_URL?: string
  readonly VITE_ENABLE_REWARDED_ADS?: string
  readonly VITE_ENABLE_GUEST_UNLOCKS?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
