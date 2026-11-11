import { useQuery } from "convex/react"
import { useEffect } from "react"
import { api } from "../../convex/_generated/api"
import { getPostHogClient } from "~/lib/posthog"

const SIGNUP_WINDOW_MS = 10 * 60 * 1000
const SIGNUP_KEY_PREFIX = "lumo:posthog:signed_up:"

export function PostHogIdentify() {
  const viewer = useQuery(api.users.viewer)

  useEffect(() => {
    const client = getPostHogClient()
    if (!client || viewer === undefined || viewer === null) {
      return
    }

    client.identify(viewer._id)

    const createdAgo = Date.now() - viewer._creationTime
    if (createdAgo >= 0 && createdAgo <= SIGNUP_WINDOW_MS) {
      const key = `${SIGNUP_KEY_PREFIX}${viewer._id}`
      if (typeof localStorage !== "undefined" && !localStorage.getItem(key)) {
        client.capture("user_signed_up")
        localStorage.setItem(key, "1")
      }
    }
  }, [viewer])

  return null
}
