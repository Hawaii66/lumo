import { createFileRoute } from "@tanstack/react-router"
import { DashboardThemeShell } from "~/components/dashboard/dashboard-theme-shell"
import { PdfToolsPage } from "~/components/pdf-tools/pdf-tools-page"

export const Route = createFileRoute("/pdf")({
  component: PdfRoute,
})

function PdfRoute() {
  return (
    <DashboardThemeShell>
      <PdfToolsPage />
    </DashboardThemeShell>
  )
}
