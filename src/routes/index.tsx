import { createFileRoute, Link } from "@tanstack/react-router"
import { Logo } from "~/components/brand/logo"
import { FeatureBento } from "~/components/marketing/feature-bento"
import { FeatureHighlights } from "~/components/marketing/feature-highlights"
import { HomeAppearanceShell } from "~/components/marketing/home-appearance-shell"
import { ScanToMacbook } from "~/components/marketing/scan-to-macbook"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <HomeAppearanceShell>
      <main>
        <FeatureHighlights />
        <ScanToMacbook />
        <FeatureBento />
        <footer className="border-t border-neutral-200 bg-neutral-100 px-6 py-12 md:px-8 dark:border-neutral-800 dark:bg-black">
          <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <Logo
                size="sm"
                wordmarkClassName="text-sm font-medium text-neutral-900 dark:text-white"
              />
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                AI-plugg gjort rätt
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                Kontakt
              </p>
              <div className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                <a
                  href="mailto:lumo@hawaiidev.sh"
                  className="block hover:text-neutral-900 dark:hover:text-neutral-200"
                >
                  lumo@hawaiidev.sh
                </a>
                <Link
                  to="/privacy-policy"
                  className="block hover:text-neutral-900 dark:hover:text-neutral-200"
                >
                  Integritetspolicy
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </HomeAppearanceShell>
  )
}
