import { Link } from "@tanstack/react-router"
import { motion } from "motion/react"
import { BackgroundBeams } from "~/components/ui/background-beams"
import { Button } from "~/components/ui/button"

export function HomeHero() {
  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden bg-[oklch(0.18_0.02_250)] text-white">
      <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10">
        <span className="text-lg font-semibold tracking-tight">Lumo</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
            render={<Link to="/signin" />}
          >
            Logga in
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            render={<Link to="/signup" />}
          >
            Skapa konto
          </Button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-4 text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl"
        >
          Lumo
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="max-w-3xl text-balance text-2xl font-medium tracking-tight text-white/90 sm:text-3xl md:text-4xl"
        >
          AI-plugg gjort rätt
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-4 max-w-2xl text-pretty text-base text-white/65 sm:text-lg"
        >
          Skapa rum för varje kurs där allt som hör till kursen samlas — AI-chattar,
          PDF:er, bilder, uppgifter, tentor.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.24 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            size="lg"
            className="h-11 bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90"
            render={<Link to="/signup" />}
          >
            Skapa konto
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 border-primary bg-transparent px-6 text-base text-primary hover:bg-primary/10 hover:text-primary"
            render={<Link to="/signin" />}
          >
            Logga in
          </Button>
        </motion.div>
      </div>

      <BackgroundBeams className="z-0 opacity-80" />
    </section>
  )
}
