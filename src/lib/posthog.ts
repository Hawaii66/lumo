import posthog from "posthog-js"

let initialized = false

export function getPostHogClient() {
  if (typeof window === "undefined") {
    return null
  }

  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
  if (!token || typeof token !== "string" || token.length === 0) {
    return null
  }

  if (!initialized) {
    const host =
      import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com"
    posthog.init(token, {
      api_host: host,
      defaults: "2026-08-30",
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
      // Also enable "Exception autocapture" in PostHog → Error tracking settings.
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
    })
    initialized = true
  }

  return posthog
}

export function captureSignupClicked() {
  getPostHogClient()?.capture("signup_clicked")
}
