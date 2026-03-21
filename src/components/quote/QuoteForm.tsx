"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

interface QuoteFormProps {
  lang: string;
  dictionary: Record<string, string>;
}

/**
 * Quote form placeholder — will be replaced with the full 6-step form.
 * The form requires: react-hook-form, Zod, Google Maps, PostHog, phone validation.
 */
export function QuoteForm({ lang, dictionary }: QuoteFormProps) {
  const title = dictionary["pages.quote.blocks.hero.title"] ||
    (lang === "de" ? "Offerteanfrage" : "Demande de devis");
  const subtitle = dictionary["pages.quote.blocks.hero.subtitle"] ||
    (lang === "de"
      ? "Erhalten Sie in wenigen Minuten ein Angebot für Ihre Ladestation."
      : "Recevez en quelques minutes un devis pour votre borne de recharge.");

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center space-y-4 mb-12">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg">
          {subtitle}
        </p>
      </div>

      <div className="border rounded-xl p-8 bg-card text-center space-y-4">
        <p className="text-muted-foreground">
          {lang === "de"
            ? "Das Angebotsformular wird gerade migriert."
            : "Le formulaire de devis est en cours de migration."}
        </p>
        <Button render={<Link href={`/${lang}`} />}>
          {lang === "de" ? "Zurück zur Startseite" : "Retour à l'accueil"}
        </Button>
      </div>
    </div>
  );
}
