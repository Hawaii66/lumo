import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/preview")({
  component: PreviewLayout,
})

function PreviewLayout() {
  return <Outlet />
}
