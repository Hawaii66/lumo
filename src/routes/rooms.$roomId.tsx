import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/rooms/$roomId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/rooms/$roomId",
      params: { roomId: params.roomId },
    })
  },
  component: () => null,
})
