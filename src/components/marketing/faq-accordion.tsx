import { IconMinus, IconPlus } from "@tabler/icons-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { cn } from "~/lib/utils"

/** Common questions derived from MARKETING.md features. */
const faqs = [
  {
    question: "Vad är Lumo?",
    answer:
      "Lumo är AI-plugg gjort rätt. Skapa rum för varje kurs där allt som hör till kursen samlas — AI-chattar, PDF:er, bilder, uppgifter och tentor.",
  },
  {
    question: "Vad är ett kursrum?",
    answer:
      "Ett kursrum samlar allt för en kurs på ett ställe: AI-chattar, PDF:er, bilder, uppgifter och tentor. Du kan kopiera rum skapade av andra användare för instant setup.",
  },
  {
    question: "Kostar det något att plugga?",
    answer:
      "Du får gratis dagliga credits och kan köpa fler när som helst.",
  },
  {
    question: "Vad händer när jag laddar upp en PDF?",
    answer:
      "Lumo extraherar uppgifter så att AI direkt förstår vilken uppgift du pratar om, och kan även plocka ut studiemetoder så hjälpen blir rätt från början.",
  },
  {
    question: "Hur startar jag en chatt från en uppgift?",
    answer:
      "Med uppgiftsväljaren plockar du uppgifter från alla PDF:er — exempelsamlingar, tentor, kontrollskrivningar eller egna — på ett ställe och startar en chatt direkt från den uppgiften.",
  },
  {
    question: "Kan jag skanna mitt arbete med telefonen?",
    answer:
      "Ja. Skanna QR-koden på datorn, ta en bild med telefonen så synkas arbetet direkt — AI kan hjälpa dig där du kört fast eller hitta små slarvfel.",
  },
  {
    question: "Vad är tvillinguppgifter?",
    answer:
      "Tvillinguppgifter låter AI generera en ny, liknande uppgift utifrån en befintlig — så du kan öva mer på svåra problem. Du kan också markera färdiga uppgifter som klara.",
  },
]

function FaqItem({
  question,
  answer,
  open,
  onOpenChange,
}: {
  question: string
  answer: string
  open: boolean
  onOpenChange: () => void
}) {
  return (
    <div className="py-5">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-3 text-left"
        onClick={onOpenChange}
        aria-expanded={open}
      >
        <span className="relative mt-0.5 size-5 shrink-0 text-primary">
          <IconPlus
            className={cn(
              "absolute inset-0 size-5 transition duration-200",
              open
                ? "rotate-90 scale-0 opacity-0"
                : "rotate-0 scale-100 opacity-100",
            )}
          />
          <IconMinus
            className={cn(
              "absolute inset-0 size-5 transition duration-200",
              open
                ? "rotate-0 scale-100 opacity-100"
                : "-rotate-90 scale-0 opacity-0",
            )}
          />
        </span>
        <span className="min-w-0 flex-1 text-base font-medium text-white md:text-lg">
          {question}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="pt-3 pl-8 text-sm leading-relaxed text-neutral-400 md:pl-8 md:text-base">
              {answer}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Two-column FAQ accordion — Aceternity “frequently-asked-questions-with-accordion” motif. */
export function FaqAccordion({ className }: { className?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(2)

  return (
    <section className={cn("w-full py-16 md:py-24", className)}>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl lg:text-5xl">
          Vanliga frågor
        </h2>

        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {faqs.map((faq, index) => (
            <FaqItem
              key={faq.question}
              question={faq.question}
              answer={faq.answer}
              open={openIndex === index}
              onOpenChange={() =>
                setOpenIndex((current) => (current === index ? null : index))
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}
