import { createFileRoute } from "@tanstack/react-router"
import { DashboardThemeShell } from "~/components/dashboard/dashboard-theme-shell"
import { PdfParseLabPage } from "~/components/admin/pdf-parse-lab-page"

export const Route = createFileRoute("/admin/pdf-parse")({
  component: AdminPdfParseRoute,
})

function AdminPdfParseRoute() {
  return (
    <DashboardThemeShell>
      <PdfParseLabPage />
    </DashboardThemeShell>
  )
}
