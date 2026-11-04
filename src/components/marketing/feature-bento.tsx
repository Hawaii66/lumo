import {
  IconArchive,
  IconBooks,
  IconChartBar,
  IconCircleCheck,
  IconCoin,
  IconCopy,
  IconFileText,
  IconMathFunction,
  IconMessageChatbot,
  IconPdf,
  IconQrcode,
  IconTemplate,
  IconUpload,
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

const items = [
  {
    title: "Kursrum",
    description:
      "Allt för en kurs på ett ställe: AI-chattar, PDF:er, bilder, uppgifter och tentor.",
    header: <Skeleton className="from-secondary/20 via-accent to-muted" />,
    className: "md:col-span-2",
    icon: <IconBooks className="h-4 w-4 text-primary" />,
  },
  {
    title: "Instant setup från delade rum",
    description:
      "Kopiera rum skapade av andra användare eller lärare för instant setup. Ingen konfiguration behövs — alla uppgifter och all info finns redan där.",
    header: <Skeleton className="from-primary/20 via-muted to-accent" />,
    className: "md:col-span-1",
    icon: <IconCopy className="h-4 w-4 text-primary" />,
  },
  {
    title: "PDF → uppgifter",
    description:
      "Ladda upp PDF:er och extrahera uppgifter så att AI direkt förstår vilken uppgift du pratar om.",
    header: <Skeleton className="from-accent via-muted to-secondary/15" />,
    className: "md:col-span-1",
    icon: <IconUpload className="h-4 w-4 text-primary" />,
  },
  {
    title: "PDF → studiemetoder",
    description:
      "Ladda upp PDF:er och extrahera information som rekommenderade metoder så att AI hjälper dig på rätt sätt från början.",
    header: <Skeleton className="from-muted via-primary/10 to-accent" />,
    className: "md:col-span-1",
    icon: <IconFileText className="h-4 w-4 text-primary" />,
  },
  {
    title: "Svårighetsbedömning",
    description:
      "Poängsätt uppgifter efter svårighet så du vet i vilken ordning du ska plugga dem.",
    header: <Skeleton className="from-secondary/15 via-accent to-muted" />,
    className: "md:col-span-1",
    icon: <IconChartBar className="h-4 w-4 text-primary" />,
  },
  {
    title: "Markera som klar",
    description: "Markera färdiga uppgifter som klara.",
    header: <Skeleton className="from-primary/15 via-muted to-accent" />,
    className: "md:col-span-1",
    icon: <IconCircleCheck className="h-4 w-4 text-primary" />,
  },
  {
    title: "Uppgiftsväljare → chatt",
    description:
      "Välj uppgifter från alla parsade PDF:er (exempelsamlingar, tentor, kontrollskrivningar, egna) på ett ställe och starta en chatt direkt från den uppgiften.",
    header: <Skeleton className="from-accent via-muted to-primary/10" />,
    className: "md:col-span-2",
    icon: <IconMessageChatbot className="h-4 w-4 text-primary" />,
  },
  {
    title: "Skanna med telefon",
    description:
      "Ladda upp ditt pågående arbete till AI via skanna-med-telefon, så den kan hjälpa dig där du kört fast eller hitta små slarvfel.",
    header: <Skeleton className="from-muted via-accent to-secondary/15" />,
    className: "md:col-span-1",
    icon: <IconQrcode className="h-4 w-4 text-primary" />,
  },
  {
    title: "Korrekt matematikinput",
    description:
      "Skriv till AI med korrekt formaterad matematik så den direkt förstår vad du faktiskt menar — och kommunikationen blir tydligare.",
    header: <Skeleton className="from-primary/20 via-muted to-accent" />,
    className: "md:col-span-1",
    icon: <IconMathFunction className="h-4 w-4 text-primary" />,
  },
  {
    title: "Tvillinguppgifter",
    description:
      "Skapa tvillinguppgifter där AI genererar en ny liknande uppgift så du kan öva mer på svåra problem.",
    header: <Skeleton className="from-secondary/15 via-accent to-muted" />,
    className: "md:col-span-1",
    icon: <IconTemplate className="h-4 w-4 text-primary" />,
  },
  {
    title: "Gratis dagliga credits",
    description: "Gratis dagliga credits för motiverande vardagsplugg.",
    header: <Skeleton className="from-accent via-primary/10 to-muted" />,
    className: "md:col-span-1",
    icon: <IconCoin className="h-4 w-4 text-primary" />,
  },
  {
    title: "PDF-verktyg",
    description: "Slå ihop och dela upp PDF:er.",
    header: <Skeleton className="from-muted via-accent to-primary/15" />,
    className: "md:col-span-1",
    icon: <IconPdf className="h-4 w-4 text-primary" />,
  },
  {
    title: "Autoarkivering",
    description:
      "Uppgiftschattar arkiveras automatiskt efter 3 timmar, när du faktiskt är klar med den chatten.",
    header: <Skeleton className="from-primary/15 via-muted to-accent" />,
    className: "md:col-span-1",
    icon: <IconArchive className="h-4 w-4 text-primary" />,
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
