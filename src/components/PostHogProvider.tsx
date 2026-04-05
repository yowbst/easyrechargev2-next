"use client";

import { useEffect, useState, Suspense, createContext, useContext } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PostHog } from "posthog-js";

const PostHogContext = createContext<PostHog | null>(null);
export const usePostHog = () => useContext(PostHogContext);

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname;
      const search = searchParams?.toString();
      if (search) url += `?${search}`;
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    const init = async () => {
      const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
      if (!key) return;

      const posthog = (await import("posthog-js")).default;

      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
        capture_pageview: false,
        capture_pageleave: true,
        persistence: "localStorage",
        person_profiles: "identified_only",
        capture_performance: true,
        capture_exceptions: true,
        disable_session_recording: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: ".ph-no-capture",
        },
      });
      setClient(posthog);

      // Start session recording after further delay
      setTimeout(() => posthog.startSessionRecording(), 5000);
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => init(), { timeout: 3000 });
    } else {
      setTimeout(() => init(), 2000);
    }
  }, []);

  return (
    <PostHogContext.Provider value={client}>
      <Suspense fallback={null}>
        {client && <PostHogPageView />}
      </Suspense>
      {children}
    </PostHogContext.Provider>
  );
}
