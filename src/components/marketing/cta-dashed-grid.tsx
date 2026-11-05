import { Link } from "@tanstack/react-router"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

function GridLineHorizontal({
  className,
  offset = "8rem",
}: {
  className?: string
  offset?: string
}) {
  return (
    <div
      style={
        {
          "--offset": offset,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute h-px w-[calc(100%+var(--offset))] bg-[linear-gradient(to_right,transparent,var(--color-border)_10%,var(--color-border)_90%,transparent)] [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]",
        className,
      )}
    />
  )
}

function GridLineVertical({
  className,
  offset = "8rem",
}: {
  className?: string
  offset?: string
}) {
  return (
    <div
      style={
        {
          "--offset": offset,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute w-px h-[calc(100%+var(--offset))] bg-[linear-gradient(to_bottom,transparent,var(--color-border)_10%,var(--color-border)_90%,transparent)] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]",
        className,
      )}
    />
  )
}

/** CTA with dashed edge lines — Aceternity “cta-with-dashed-grid-lines” motif. */
export function CtaDashedGrid({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative z-30 mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-dashed border-border bg-card shadow-lg",
        className,
      )}
    >
      <GridLineHorizontal className="top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <GridLineHorizontal className="bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" />
      <GridLineVertical className="top-1/2 left-0 -translate-x-1/2 -translate-y-1/2" />
      <GridLineVertical className="top-1/2 right-0 translate-x-1/2 -translate-y-1/2" />

      <div className="grid md:grid-cols-3">
        <div className="flex flex-col justify-center gap-5 p-8 md:col-span-2 md:p-10 md:pr-8">
          <h2 className="pt-2 text-3xl font-semibold tracking-tight text-foreground md:pt-4 md:text-4xl">
            AI-plugg gjort{" "}
            <span className="text-primary">rätt</span>
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              render={<Link to="/signup" />}
            >
              Skapa konto
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10"
              render={<Link to="/signin" />}
            >
              Logga in
            </Button>
          </div>
        </div>

        <div className="flex flex-col justify-center border-t border-dashed border-border p-8 md:border-t-0 md:border-l md:p-10">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Rum för varje kurs där allt som hör till kursen samlas —
            AI-chattar, PDF:er, bilder, uppgifter, tentor.
          </p>
        </div>
      </div>
    </div>
  )
}
