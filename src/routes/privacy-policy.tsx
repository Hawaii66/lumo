import { createFileRoute, Link } from "@tanstack/react-router"
import { Logo } from "~/components/brand/logo"
import { HomeAppearanceShell } from "~/components/marketing/home-appearance-shell"

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [{ title: "Integritetspolicy — Lumo" }],
  }),
  component: PrivacyPolicyPage,
})

function PrivacyPolicyPage() {
  return (
    <HomeAppearanceShell>
      <main className="mx-auto w-full max-w-3xl px-6 py-12 md:px-8 md:py-16">
        <div className="mb-10 space-y-3">
          <Logo asLink size="sm" />
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Integritetspolicy
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Senast uppdaterad: 5 november 2026
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              1. Personuppgiftsansvarig
            </h2>
            <p>
              Lumo (&quot;vi&quot;, &quot;oss&quot;) är personuppgiftsansvarig för behandlingen
              av personuppgifter i tjänsten Lumo. Kontakta oss på{" "}
              <a
                href="mailto:lumo@hawaiidev.sh"
                className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
              >
                lumo@hawaiidev.sh
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              2. Vilka uppgifter vi samlar in
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Kontouppgifter:
                </span>{" "}
                namn, e-postadress och profilbild som du eller din
                inloggningsleverantör (t.ex. Google, Microsoft eller ChatGPT)
                lämnar vid registrering.
              </li>
              <li>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Innehåll du skapar:
                </span>{" "}
                rum, anteckningar, uppladdade filer (t.ex. PDF:er), chattar och
                andra studieuppgifter som du sparar i tjänsten.
              </li>
              <li>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Betalningsuppgifter:
                </span>{" "}
                vid köp av krediter behandlas betalningen av Stripe. Vi får
                bekräftelse på köpet, men lagrar inte hela kortuppgifter.
              </li>
              <li>
                <span className="font-medium text-neutral-900 dark:text-white">
                  Teknisk och användningsdata:
                </span>{" "}
                uppgifter som behövs för att driva tjänsten, t.ex. inloggning,
                kreditförbrukning och fel-/säkerhetsloggar.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              3. Varför vi behandlar uppgifterna
            </h2>
            <p>Vi behandlar personuppgifter för att:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>tillhandahålla och förbättra Lumo, inklusive AI-stöd</li>
              <li>hantera konton, inloggning och behörigheter</li>
              <li>genomföra betalningar och kreditköp</li>
              <li>ge support och kommunicera viktiga tjänstemeddelanden</li>
              <li>uppfylla rättsliga skyldigheter och skydda tjänsten</li>
            </ul>
            <p>
              Behandlingen grundas främst på avtal (att leverera tjänsten),
              berättigat intresse (säkerhet och förbättring) och, när det krävs,
              samtycke eller rättslig förpliktelse.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              4. Delning med tredje part
            </h2>
            <p>
              Vi delar uppgifter med leverantörer som behövs för att driva
              Lumo, bland annat:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>hosting och databas (Convex)</li>
              <li>betalningar (Stripe)</li>
              <li>AI-leverantörer via OpenRouter för att generera svar</li>
              <li>inloggningsleverantörer som du själv väljer</li>
            </ul>
            <p>
              Vi säljer inte dina personuppgifter. Mottagare får endast behandla
              uppgifter enligt våra instruktioner och gällande avtal.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              5. Lagring och överföring
            </h2>
            <p>
              Uppgifter sparas så länge ditt konto är aktivt, eller så länge det
              behövs för tjänsten, support, bokföring eller andra rättsliga krav.
              Vissa leverantörer kan behandla data utanför EU/EES. När så sker
              använder vi lämpliga skyddsåtgärder, t.ex. standardavtalsklausuler.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              6. Cookies och lokal lagring
            </h2>
            <p>
              Vi använder nödvändiga cookies och lokal lagring för inloggning,
              sessioner och enkla inställningar (t.ex. utseende). Vi använder
              inte reklamcookies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              7. Dina rättigheter
            </h2>
            <p>
              Enligt GDPR har du rätt att begära tillgång, rättelse, radering,
              begränsning, dataportabilitet och att invända mot viss behandling.
              Du kan också lämna klagomål till Integritetsskyddsmyndigheten
              (IMY). Kontakta oss på{" "}
              <a
                href="mailto:lumo@hawaiidev.sh"
                className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-white"
              >
                lumo@hawaiidev.sh
              </a>{" "}
              om du vill utöva dina rättigheter.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-neutral-900 dark:text-white">
              8. Ändringar
            </h2>
            <p>
              Vi kan uppdatera den här policyn när tjänsten eller lagstiftningen
              ändras. Den senaste versionen publiceras alltid på den här sidan.
            </p>
          </section>
        </div>

        <p className="mt-12 text-sm">
          <Link
            to="/"
            className="text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
          >
            ← Tillbaka till startsidan
          </Link>
        </p>
      </main>
    </HomeAppearanceShell>
  )
}
