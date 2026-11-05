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
      <footer className="border-t border-neutral-800 bg-black px-6 py-12 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">Lumo</p>
            <p className="text-sm text-neutral-400">AI-plugg gjort rätt</p>
            <Link
              to="/lab"
              className="inline-block pt-2 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
            >
              Utvecklarverktyg →
            </Link>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-white">Kontakt</p>
            <div className="space-y-1.5 text-sm text-neutral-400">
              <a
                href="mailto:hej@lumo.se"
                className="block hover:text-neutral-200"
              >
                hej@lumo.se
              </a>
              <a href="tel:+46812345678" className="block hover:text-neutral-200">
                08-123 45 678
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
