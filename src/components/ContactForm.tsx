"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ContactFormProps {
  lang: string;
  dictionary: Record<string, string>;
}

/**
 * Contact form placeholder — will be replaced with the full form.
 * The form requires: react-hook-form, Google Maps, phone validation.
 */
export function ContactForm({ lang, dictionary }: ContactFormProps) {
  const title = dictionary["pages.contact.blocks.hero.title"] ||
    (lang === "de" ? "Kontakt" : "Contact");
  const subtitle = dictionary["pages.contact.blocks.hero.subtitle"] ||
    (lang === "de"
      ? "Kontaktieren Sie uns für alle Ihre Fragen."
      : "Contactez-nous pour toutes vos questions.");

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
            ? "Das Kontaktformular wird gerade migriert."
            : "Le formulaire de contact est en cours de migration."}
        </p>
        <Button render={<Link href={`/${lang}`} />}>
          {lang === "de" ? "Zurück zur Startseite" : "Retour à l'accueil"}
        </Button>
      </div>
    </div>
  );
}
