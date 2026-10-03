"use client";

import Image from "next/image";
import { CheckCircle, Clock, Gift, Tag } from "lucide-react";
import type { PublicQuoteConfig } from "@/lib/public-config";

interface WelcomeStepProps {
  tq: (key: string, vars?: Record<string, string | number>) => string;
  heroImage?: string;
  globalConfig: PublicQuoteConfig;
  offer?: { active?: boolean; currency?: string; amount?: number; network?: string };
}

export function WelcomeStep({ tq, heroImage, globalConfig: gc, offer }: WelcomeStepProps) {
  const firstContact = gc.slas?.first_contact?.value ?? 48;
  const stats = [
    { value: gc.stats?.installations != null ? `${gc.stats.installations}+` : "650+", label: tq("welcome.stats.installations.label") },
    { value: gc.trustpilot?.score != null ? `${gc.trustpilot.score} ★` : "4.8 ★", label: tq("welcome.stats.rating.label") },
  ];
  const usps = [
    { icon: CheckCircle, text: tq("welcome.usps.certified") },
    { icon: Clock, text: tq("welcome.usps.fast", { quote_delivery_timeline: gc.slas?.quote_delivery_timeline?.value ?? "3-5" }) },
    { icon: Tag, text: tq("welcome.usps.transparent") },
  ];

  return (
    <div>
      {heroImage ? (
        <div className="relative h-56 overflow-hidden">
          <Image src={heroImage} alt="" fill priority quality={60} sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/10" />
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            <h1 className="text-2xl font-heading font-bold text-white leading-tight">{tq("welcome.title")}</h1>
            <p className="text-sm text-white/80 mt-1">{tq("welcome.subtitle", { first_contact: firstContact })}</p>
          </div>
        </div>
      ) : (
        <div className="px-6 pt-6">
          <h1 className="text-2xl font-heading font-bold">{tq("welcome.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{tq("welcome.subtitle", { first_contact: firstContact })}</p>
        </div>
      )}

      <div className="grid grid-cols-2 border-b border-border/60 bg-primary/5">
        {stats.map((stat, i) => (
          <div key={stat.label} className={`py-4 px-3 text-center ${i === 0 ? "border-r border-border/60" : ""}`}>
            <div className="text-xl font-bold text-primary">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-3">
        {usps.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{text}</span>
          </div>
        ))}
      </div>

      {offer && offer.active !== false && (
        <div className="mx-6 mb-6 pt-5 border-t border-primary/20">
          <div className="flex items-start gap-3">
            <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-heading font-semibold text-sm text-foreground mb-1">{tq("welcome.offer.title")}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {tq("welcome.offer.description", { currency: offer.currency || "CHF", amount: offer.amount || 50, network: offer.network || "Shell" })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
