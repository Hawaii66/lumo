import { createFileRoute, Link } from "@tanstack/react-router"
import { FeatureBento } from "~/components/marketing/feature-bento"
import { FeatureHighlights } from "~/components/marketing/feature-highlights"
import { ScanToMacbook } from "~/components/marketing/scan-to-macbook"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main className="min-h-svh">
      <FeatureHighlights />
      <ScanToMacbook />
      <FeatureBento />
      <footer className="border-t border-border px-6 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Lumo: AI-plugg gjort rätt</span>
          <Link
            to="/lab"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Utvecklarverktyg →
          </Link>
        </div>
      </footer>
    </main>
  )
}
