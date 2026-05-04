import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'

type AnalyticsEvent = {
  name: string
  properties?: Record<string, string | number | boolean | null | undefined>
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
const sentryEnvironment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE
const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let telemetryReady = false

export function initTelemetry() {
  if (telemetryReady) return

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: sentryEnvironment,
      enabled: true,
      tracesSampleRate: 0,
    })
  }

  if (posthogKey && typeof window !== 'undefined') {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: false,
      persistence: 'localStorage+cookie',
      autocapture: false,
    })
  }

  telemetryReady = true
}

export function trackEvent(event: AnalyticsEvent) {
  if (!telemetryReady) initTelemetry()
  if (posthogKey) posthog.capture(event.name, event.properties)
}

export function trackScreenView(path: string, properties: AnalyticsEvent['properties'] = {}) {
  trackEvent({
    name: 'screen_view',
    properties: {
      path,
      ...properties,
    },
  })
}

export function captureError(error: unknown, context?: Record<string, string | number | boolean | null | undefined>) {
  if (!telemetryReady) initTelemetry()
  if (sentryDsn) {
    Sentry.captureException(error, {
      extra: context,
    })
  }
}
