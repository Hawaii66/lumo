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
      capture_pageview: true,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
      disable_session_recording: true,
    })
    initialized = true
  }

  return posthog
}

export function captureSignupClicked() {
  getPostHogClient()?.capture("signup_clicked")
}
