import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bestätigung der Offerte | easyRecharge",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ lang: string }>;
}

export default async function QuoteSuccessDe({ params }: Props) {
  const { lang } = await params;

  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <div className="text-center space-y-6 max-w-lg px-4">
        <CheckCircle className="h-16 w-16 text-primary mx-auto" />
        <h1 className="font-heading text-3xl font-bold">
          Vielen Dank für Ihre Anfrage!
        </h1>
        <p className="text-muted-foreground text-lg">
          Ihre Offerteanfrage wurde erfolgreich registriert. Ein zertifizierter
          Installateur wird sich in Kürze bei Ihnen melden.
        </p>
        <Link
          href={`/${lang}`}
          className={cn(buttonVariants(), "mt-4")}
        >
          Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}
