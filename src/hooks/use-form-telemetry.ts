"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getConsent } from "@/lib/consent";
// Lazy PostHog access — the module is loaded async by PostHogProvider
async function getPostHog() {
  try {
    const { default: posthog } = await import("posthog-js");
    return posthog.__loaded ? posthog : null;
  } catch { return null; }
}

interface FormEvent {
  eventType: "focus" | "change" | "blur" | "submit" | "submit_success" | "submit_error";
  fieldName?: string;
  fieldValue?: string;
  eventPayload?: Record<string, unknown>;
}

interface UseFormTelemetryOptions {
  formType: string;
  locale?: string;
  batchSize?: number;
  flushInterval?: number;
}

const BATCH_SIZE = 5;
const FLUSH_INTERVAL = 10000;
const LS_KEY = "form_telemetry_session";
const COOKIE_NAME = "ftid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax${secure}`;
}

function getOrCreateSessionToken(): string {
  const consented = getConsent() === "accepted";

  const token =
    (typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null) ??
    readCookie(COOKIE_NAME) ??
    crypto.randomUUID();

  if (consented) {
    try { localStorage.setItem(LS_KEY, token); } catch { /* private mode */ }
    writeCookie(COOKIE_NAME, token);
    try {
      getPostHog().then((ph) => {
        ph?.register({ ftid: token });
        ph?.setPersonProperties({ ftid: token });
      });
    } catch { /* PostHog may not be initialized */ }
  }

  return token;
}

export function useFormTelemetry(options: UseFormTelemetryOptions) {
  const { formType, locale, batchSize = BATCH_SIZE, flushInterval = FLUSH_INTERVAL } = options;
  const pathname = usePathname();
  const eventQueue = useRef<FormEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionToken = useRef<string>(getOrCreateSessionToken());

  const flushEvents = useCallback(() => {
    if (eventQueue.current.length === 0) return;

    const eventsToSend = [...eventQueue.current];
    eventQueue.current = [];

    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }

    getPostHog().then((posthog) => {
      if (!posthog) return;
      for (const event of eventsToSend) {
        try {
          posthog.capture("form_field_event", {
            form_type: formType,
            event_type: event.eventType,
            field_name: event.fieldName,
            field_value: event.fieldValue,
            session_token: sessionToken.current,
            locale,
            location_path: pathname,
            ...(event.eventPayload ?? {}),
          });
        } catch { /* PostHog may not be initialized */ }
      }
    });
  }, [formType, locale, pathname]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushEvents, flushInterval);
  }, [flushEvents, flushInterval]);

  const trackEvent = useCallback((event: FormEvent) => {
    eventQueue.current.push(event);
    if (eventQueue.current.length >= batchSize) {
      flushEvents();
    } else {
      scheduleFlush();
    }
  }, [batchSize, flushEvents, scheduleFlush]);

  const trackFocus = useCallback((fieldName: string) => {
    trackEvent({ eventType: "focus", fieldName });
  }, [trackEvent]);

  const trackChange = useCallback((fieldName: string, fieldValue: string) => {
    trackEvent({ eventType: "change", fieldName, fieldValue });
  }, [trackEvent]);

  const trackBlur = useCallback((fieldName: string) => {
    trackEvent({ eventType: "blur", fieldName });
  }, [trackEvent]);

  const trackSubmit = useCallback((success: boolean, payload?: Record<string, unknown>) => {
    trackEvent({ eventType: success ? "submit_success" : "submit_error", eventPayload: payload });
    flushEvents();
  }, [trackEvent, flushEvents]);

  useEffect(() => {
    return () => {
      if (eventQueue.current.length > 0) flushEvents();
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, [flushEvents]);

  return { trackFocus, trackChange, trackBlur, trackSubmit, sessionToken: sessionToken.current };
}
