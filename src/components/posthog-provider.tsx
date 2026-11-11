import {
  PostHogErrorBoundary,
  PostHogProvider as PHProvider,
} from "@posthog/react"
import type { ReactNode } from "react"
import { getPostHogClient } from "~/lib/posthog"
import { PostHogIdentify } from "~/components/posthog-identify"

function ErrorFallback() {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="text-lg font-medium">Något gick fel</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Ladda om sidan eller försök igen om en stund.
      </p>
    </div>
  )
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const client = getPostHogClient()
  if (client === null) {
    return <>{children}</>
  }

  return (
    <PHProvider client={client}>
      <PostHogErrorBoundary fallback={<ErrorFallback />}>
        <PostHogIdentify />
        {children}
      </PostHogErrorBoundary>
    </PHProvider>
  )
}
