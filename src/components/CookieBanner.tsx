"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { useCookieConsent } from "@/hooks/useCookieConsent";

interface CookieBannerProps {
  title?: string;
  description?: string;
  acceptLabel?: string;
  rejectLabel?: string;
}

export function CookieBanner({
  title = "Cookies",
  description = "Nous utilisons des cookies pour améliorer votre expérience.",
  acceptLabel = "Accepter",
  rejectLabel = "Refuser",
}: CookieBannerProps) {
  const { hasDecided, accept, reject } = useCookieConsent();

  return (
    <AnimatePresence>
      {!hasDecided && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 bg-card border rounded-xl shadow-lg p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-semibold text-sm">{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex gap-2">
            <Button onClick={accept} size="sm" className="flex-1">
              {acceptLabel}
            </Button>
            <Button
              onClick={reject}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              {rejectLabel}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
