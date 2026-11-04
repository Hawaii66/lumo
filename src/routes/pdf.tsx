import { createFileRoute } from "@tanstack/react-router"
import { PdfToolsPage } from "~/components/pdf-tools/pdf-tools-page"

export const Route = createFileRoute("/pdf")({
  component: PdfToolsPage,
})
