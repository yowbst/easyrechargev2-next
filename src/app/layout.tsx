import type { Metadata } from "next";
import { Montserrat, Open_Sans, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/providers";
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
      className={`${montserrat.variable} ${openSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
          <Providers>
            {children}
            <SpeedInsights />
            <Toaster />
          </Providers>
        </body>
    </html>
  );
}
