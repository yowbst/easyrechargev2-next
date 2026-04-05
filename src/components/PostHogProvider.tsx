"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Defer PostHog init until after the page is interactive
    const init = () => {
      const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
      if (!key) return;

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
      setReady(true);

      // Start session recording after a delay to avoid blocking main thread
      setTimeout(() => {
        posthog.startSessionRecording();
      }, 5000);
    };

    // Wait for the browser to be idle before initializing
    if ("requestIdleCallback" in window) {
      requestIdleCallback(init, { timeout: 3000 });
    } else {
      setTimeout(init, 2000);
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        {ready && <PostHogPageView />}
      </Suspense>
      {children}
    </PHProvider>
  );
}
