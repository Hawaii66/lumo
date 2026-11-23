import { createFileRoute } from "@tanstack/react-router"
import { ProblemReportsPage } from "~/components/admin/problem-reports-page"
import { DashboardThemeShell } from "~/components/dashboard/dashboard-theme-shell"

export const Route = createFileRoute("/admin/problem-reports")({
  component: AdminProblemReportsRoute,
})

function AdminProblemReportsRoute() {
  return (
    <DashboardThemeShell>
      <ProblemReportsPage />
    </DashboardThemeShell>
  )
}
