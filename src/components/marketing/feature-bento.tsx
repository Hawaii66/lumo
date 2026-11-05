import {
  IconChartBar,
  IconCircleCheck,
  IconCoin,
  IconFileText,
  IconMathFunction,
  IconMessageChatbot,
} from "@tabler/icons-react"
import { BentoGrid, BentoGridItem } from "~/components/ui/bento-grid"
import { cn } from "~/lib/utils"

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[6rem] w-full flex-1 rounded-lg bg-gradient-to-br from-muted via-accent to-primary/15",
        className,
      )}
    />
  )
}

/**
 * Desktop grid (3 cols):
 * R1: Korrekt matematikinput (1–2) | Markera som klar (3)
 * R2: Credits (1) | PDF studiemetoder (2) | Uppgiftsväljare (3, spans R2–3)
 * R3: Svårighet (1–2)                   | Uppgiftsväljare …
 */
const items = [
  {
    title: "Korrekt matematikinput",
    description:
      "Skriv till AI med korrekt formaterad matematik så den direkt förstår vad du faktiskt menar — och kommunikationen blir tydligare.",
    header: <Skeleton className="from-primary/20 via-muted to-accent" />,
    className: "md:col-start-1 md:col-span-2 md:row-start-1",
    icon: <IconMathFunction className="h-4 w-4 text-primary" />,
  },
  {
    title: "Markera som klar",
    description: "Markera färdiga uppgifter som klara.",
    header: <Skeleton className="from-primary/15 via-muted to-accent" />,
    className: "md:col-start-3 md:row-start-1",
    icon: <IconCircleCheck className="h-4 w-4 text-primary" />,
  },
  {
    title: "Gratis dagliga credits",
    description: "Gratis dagliga credits för motiverande vardagsplugg.",
    header: <Skeleton className="from-accent via-primary/10 to-muted" />,
    className: "md:col-start-1 md:row-start-2",
    icon: <IconCoin className="h-4 w-4 text-primary" />,
  },
  {
    title: "PDF → studiemetoder",
    description:
      "Ladda upp PDF:er och extrahera information som rekommenderade metoder så att AI hjälper dig på rätt sätt från början.",
    header: <Skeleton className="from-muted via-primary/10 to-accent" />,
    className: "md:col-start-2 md:row-start-2",
    icon: <IconFileText className="h-4 w-4 text-primary" />,
  },
  {
    title: "Uppgiftsväljare → chatt",
    description:
      "Välj uppgifter från alla parsade PDF:er (exempelsamlingar, tentor, kontrollskrivningar, egna) på ett ställe och starta en chatt direkt från den uppgiften.",
    header: <Skeleton className="from-accent via-muted to-primary/10" />,
    className: "md:col-start-3 md:row-start-2 md:row-span-2",
    icon: <IconMessageChatbot className="h-4 w-4 text-primary" />,
  },
  {
    title: "Svårighetsbedömning",
    description:
      "Poängsätt uppgifter efter svårighet så du vet i vilken ordning du ska plugga dem.",
    header: <Skeleton className="from-secondary/15 via-accent to-muted" />,
    className: "md:col-start-1 md:col-span-2 md:row-start-3",
    icon: <IconChartBar className="h-4 w-4 text-primary" />,
  },
]

export function FeatureBento() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16 md:px-8 md:py-20">
      <BentoGrid className="max-w-none md:auto-rows-[17rem]">
        {items.map((item) => (
          <BentoGridItem
            key={item.title}
            title={item.title}
            description={item.description}
            header={item.header}
            className={item.className}
            icon={item.icon}
          />
        ))}
      </BentoGrid>
    </section>
  )
}
