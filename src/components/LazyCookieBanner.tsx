"use client";

import dynamic from "next/dynamic";

const CookieBanner = dynamic(
  () => import("@/components/CookieBanner").then((m) => m.CookieBanner),
  { ssr: false },
);

interface LazyCookieBannerProps {
  title: string;
  description: string;
  acceptLabel: string;
  rejectLabel: string;
}

export function LazyCookieBanner(props: LazyCookieBannerProps) {
  return <CookieBanner {...props} />;
}
