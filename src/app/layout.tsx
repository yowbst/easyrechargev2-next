import type { Metadata } from "next";
import {
  Montserrat,
  Open_Sans,
  JetBrains_Mono,
  Instrument_Sans,
  Public_Sans,
} from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/providers";
import { ThemeScript } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  // Only used for specs/data below the fold — don't let its preload compete
  // with the LCP hero image on slow mobile connections.
  preload: false,
});

// Direction B, the partner space's own type. Declared here so the variables
// sit on <html> and reach the portals (sheets, popovers, tooltips) that render
// outside the partner subtree; `preload: false` keeps them off the critical
// path of the public pages, which never reference them.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const isProduction = SITE_URL === "https://easyrecharge.ch" || SITE_URL === "https://www.easyrecharge.ch";

export const metadata: Metadata = {
  title: "easyRecharge",
  description: "Installation de bornes de recharge pour véhicules électriques en Suisse",
  ...(!isProduction && {
    robots: { index: false, follow: false },
  }),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${montserrat.variable} ${openSans.variable} ${jetbrainsMono.variable} ${instrumentSans.variable} ${publicSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
          <ThemeScript />
          <Providers>
            {children}
            <SpeedInsights />
            <Toaster />
          </Providers>
        </body>
    </html>
  );
}
