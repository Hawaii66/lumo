import { Link } from "@tanstack/react-router"
import { MonitorSmartphone } from "lucide-react"
import type { ReactNode } from "react"
import { Logo } from "~/components/brand/logo"
import { Button } from "~/components/ui/button"

type MobileDesktopOnlyGateProps = {
  children: ReactNode
}

/**
 * Dashboard is desktop-only. Phones use /scan/$token via QR.
 * CSS gate (md = 768px) avoids a flash before JS hydration.
 */
export function MobileDesktopOnlyGate({ children }: MobileDesktopOnlyGateProps) {
  return (
    <>
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 py-10 text-center md:hidden">
        <Logo size="lg" asLink />
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
          <MonitorSmartphone className="size-8 text-muted-foreground" aria-hidden />
        </div>
        <div className="max-w-sm space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Dashboard är för datorn
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Öppna Lumo på din dator. Telefonen är till för att skanna QR-koden
            när du vill ladda upp bilder till ett rum.
          </p>
        </div>
        <Button variant="outline" render={<Link to="/" />}>
          Startsida
        </Button>
      </div>
      <div className="hidden md:contents">{children}</div>
    </>
  )
}
