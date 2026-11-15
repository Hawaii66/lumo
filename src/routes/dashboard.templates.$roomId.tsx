import { createFileRoute } from "@tanstack/react-router"
import type { Id } from "../../convex/_generated/dataModel"
import { TemplateStudioPage } from "~/components/rooms/template-studio-page"

export const Route = createFileRoute("/dashboard/templates/$roomId")({
  component: TemplateStudioRoute,
})

function TemplateStudioRoute() {
  const { roomId } = Route.useParams()
  return <TemplateStudioPage roomId={roomId as Id<"rooms">} />
}
