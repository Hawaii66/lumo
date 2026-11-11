import { PostHogProvider as PHProvider } from "@posthog/react"
import type { ReactNode } from "react"
import { getPostHogClient } from "~/lib/posthog"
import { PostHogIdentify } from "~/components/posthog-identify"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const client = getPostHogClient()
  if (client === null) {
    return <>{children}</>
  }

  return (
    <PHProvider client={client}>
      <PostHogIdentify />
      {children}
    </PHProvider>
  )
}
