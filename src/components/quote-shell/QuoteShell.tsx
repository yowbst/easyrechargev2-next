"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Home, Landmark, MapPin, PhoneCall } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { contactFirstUnanswered, type ContactFields } from "@/components/quote/stepValidation";
import { usePostHog } from "@/components/PostHogProvider";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { getAttributionCompact } from "@/lib/attribution";
import { adsSendTo, fireAdsConversion } from "@/lib/googleAds";
import { measureQuoteStarted } from "@/lib/openaiAds";
import { formatPhoneE164 } from "@/lib/phone-utils";
import { parseQuoteDraft, quoteDraftKey, serializeQuoteDraft } from "@/lib/quoteDraft";
import type { PublicQuoteConfig } from "@/lib/public-config";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { Product } from "@/lib/products";
import { SHELL_COPY } from "./copy";
import { makeShellT } from "./dictionary";
import { CONTACT, clampToFirstIncomplete, firstBlockingStep, stepSequence } from "./navigation";
import { hiddenFields, stepConfig } from "./pageConfig";
import { getFunnel } from "./funnels";
import { ContactStep } from "./ContactStep";
import { QuoteHeader } from "./QuoteHeader";
import { Rail, answerRows, subsidyLine, type PartnerOffer, type SubsidySummary } from "./Rail";
import type { FormValues } from "./types";

const SHARED_INITIAL: FormValues = {
  firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
  addressMode: "google", address: "", country: "CH",
  approval: "", comment: "", acceptTerms: false,
};

/** Mini-quote hand-off (MiniQuoteForm / MiniQuoteCard put these in the URL). */
const URL_PREFILL = ["housingStatus", "postalCode", "locality", "canton"] as const;

// Room left above a revealed question for the header, and below for the sticky bar.
const TOP_CLEARANCE = 96;
const BOTTOM_CLEARANCE = 104;

const answered = (v: unknown) => v !== null && v !== undefined && v !== "" && v !== false;

/** Scroll the window (never scrollIntoView) so an element sits under the header. */
function scrollToElement(el: Element) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - TOP_CLEARANCE, behavior: reduced ? "auto" : "smooth" });
}

interface QuoteShellProps {
  product: Product;
  lang: string;
  dictionary: Record<string, string>;
  quoteSlug: string;
  pageConfig?: Record<string, unknown>;
  globalConfig?: PublicQuoteConfig;
  logoSrc?: string;
  logoDarkSrc?: string;
  pageRegistry?: PageRegistryEntry[];
  /** Answers carried over from another funnel (sub-project D). */
  prefill?: FormValues;
}

export function QuoteShell({
  product, lang, dictionary, quoteSlug, pageConfig = {},
  globalConfig: gc = {}, logoSrc, logoDarkSrc, pageRegistry, prefill,
}: QuoteShellProps) {
  const funnel = getFunnel(product);
  const { tq, tqOpt, tc } = useMemo(
    () => makeShellT(dictionary, funnel.dictPageIds, SHELL_COPY[lang as "fr" | "de"] ?? SHELL_COPY.fr),
    [dictionary, funnel, lang],
  );
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "quote", locale: lang });
  const draftKey = quoteDraftKey(product);
  const hidden = useMemo(() => hiddenFields(pageConfig), [pageConfig]);
  const offer = stepConfig(pageConfig, "welcome").offer as PartnerOffer | undefined;
  const slaVars = {
    first_contact: gc.slas?.first_contact?.value ?? 48,
    quote_delivery_timeline: gc.slas?.quote_delivery_timeline?.value ?? "3-5",
  };

  const [data, setData] = useState<FormValues>(() => ({ ...SHARED_INITIAL, ...funnel.initialData, ...prefill }));
  const [stepId, setStepId] = useState<string>(funnel.steps[0].id);
  const [nudged, setNudged] = useState<{ field: string; el: HTMLElement } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  /** What the mini-quote handed over, shown as already answered on the first step. */
  const [prefilled, setPrefilled] = useState<FormValues | null>(null);
  const [subsidy, setSubsidy] = useState<SubsidySummary | null>(null);
  const miniQuoteSessionTokenRef = useRef<string | null>(null);
  // quote_start (Ads + OpenAI) fires once, on completing the first step.
  const startedRef = useRef(false);
  // Set by a tile choice; the next render reveals and scrolls to what follows.
  const advanceRef = useRef(false);
  // The page is being left on purpose (submit redirect): no beforeunload prompt.
  const leavingRef = useRef(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const missingFor = (id: string, d: FormValues): string | null => {
    if (id === CONTACT) return contactFirstUnanswered(d as unknown as ContactFields);
    return funnel.firstUnansweredField(id, d, hidden);
  };
  const exitsAt = (id: string, d: FormValues): boolean =>
    funnel.steps.find((s) => s.id === id)?.exit?.(d) ?? false;

  // Latest answers for the listeners registered once.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const seq = stepSequence(funnel.steps, data);
  const index = Math.max(0, seq.indexOf(stepId));
  const currentId = seq[index];
  const isContact = currentId === CONTACT;
  const productStep = funnel.steps.find((s) => s.id === currentId);
  const exited = productStep?.exit?.(data) ?? false;
  const dirty = funnel.steps.some((s) => s.summary?.some((f) => answered(data[f]))) || answered(data.email) || answered(data.phone);

  const eventProps = () => ({
    form_type: "quote",
    product,
    locale: lang,
    entry_point: miniQuoteSessionTokenRef.current ? "mini-quote" : "direct",
    shell: "v2",
  });

  // Restore the draft, read mini-quote hand-off params, land on the right step.
  useEffect(() => {
    let restored: FormValues = {};
    try {
      restored = parseQuoteDraft(sessionStorage.getItem(draftKey), Date.now()) ?? {};
    } catch { /* storage unavailable (private mode) — start fresh */ }

    const params = new URLSearchParams(window.location.search);
    const fromUrl: FormValues = {};
    for (const key of URL_PREFILL) {
      const v = params.get(key);
      if (v) fromUrl[key] = v;
    }
    const token = params.get("sessionToken");
    if (token) miniQuoteSessionTokenRef.current = token;

    const merged = { ...SHARED_INITIAL, ...funnel.initialData, ...prefill, ...restored, ...fromUrl, ...funnel.fixedData };
    const mergedSeq = stepSequence(funnel.steps, merged);
    const landing = clampToFirstIncomplete(mergedSeq, params.get("step"), (id) => missingFor(id, merged));
    setData(merged);
    setStepId(landing);
    if (fromUrl.housingStatus || fromUrl.postalCode) setPrefilled(fromUrl);
    // No welcome screen since v2: the first question is the funnel's first view.
    ph?.capture("quote_step_viewed", { ...eventProps(), step: mergedSeq.indexOf(landing) + 1, step_name: landing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft so refresh / back-navigation resumes.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey, serializeQuoteDraft(data, Date.now()));
      } catch { /* quota/private mode — non-fatal */ }
    }, 400);
    return () => clearTimeout(id);
  }, [data, draftKey]);

  // Browser back/forward: never land past a step whose answers are missing
  // (answers may have changed since that history entry was pushed).
  useEffect(() => {
    const onPop = () => {
      const d = dataRef.current;
      const urlStep = new URLSearchParams(window.location.search).get("step");
      setStepId(clampToFirstIncomplete(stepSequence(funnel.steps, d), urlStep, (id) => missingFor(id, d)));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The draft is kept, so leaving only needs a quiet browser prompt — and only
  // once something has been answered.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // The commune's subsidy for the side panel, once NPA and locality are known.
  const postalCode = typeof data.postalCode === "string" ? data.postalCode.trim() : "";
  const locality = typeof data.locality === "string" ? data.locality.trim() : "";
  useEffect(() => {
    if (!/^\d{4}$/.test(postalCode) || !locality) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/cms/localities/subsidy-summary?${new URLSearchParams({ postalCode, locality })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => setSubsidy(s?.locality ? (s as SubsidySummary) : null))
        .catch(() => { /* aborted or offline: keep the general line */ });
    }, 400);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [postalCode, locality]);

  // Auto-advance (design 15 v2): after a choice, scroll to the question it
  // revealed; once the step is complete, focus "Continue". Never changes step.
  useEffect(() => {
    if (!advanceRef.current) return;
    advanceRef.current = false;
    const id = window.setTimeout(() => {
      const next = missingFor(currentId, dataRef.current);
      if (!next) {
        nextButtonRef.current?.focus({ preventScroll: true });
        return;
      }
      const el = document.getElementById(`q-${next}`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < TOP_CLEARANCE || rect.bottom > window.innerHeight - BOTTOM_CLEARANCE) scrollToElement(el);
    }, 200); // RevealField opens in 180 ms
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const set = (field: string, value: unknown) => {
    if (nudged) setNudged(null);
    telemetry.trackChange(field, String(value));
    // Typing (exact kWc, contact details) must not move the page.
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (!isContact && !typing) advanceRef.current = true;
    setData((prev) => funnel.applyChange(field, value, prev));
  };
  const patch = (updates: FormValues) => setData((prev) => ({ ...prev, ...updates }));

  const goToStep = (nextId: string) => {
    const nextIndex = seq.indexOf(nextId);
    if (nextIndex > index) {
      ph?.capture("quote_step_completed", { ...eventProps(), step: index + 1, step_name: currentId });
      if (index === 0 && !startedRef.current) {
        startedRef.current = true;
        const startSendTo = adsSendTo(gc.google_ads, "quote_start", product);
        if (startSendTo) fireAdsConversion(startSendTo);
        measureQuoteStarted(product);
      }
    }
    ph?.capture("quote_step_viewed", { ...eventProps(), step: nextIndex + 1, step_name: nextId });
    const url = new URL(window.location.href);
    url.searchParams.set("step", nextId);
    url.hash = "";
    history.pushState({}, "", url.toString());
    setNudged(null);
    setStepId(nextId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Scroll to the missing question, pulse it and say what is missing under it.
  const nudgeField = (field: string) => {
    ph?.capture("quote_missing_answer_nudge", { ...eventProps(), step: index + 1, step_name: currentId, field });
    const el = document.getElementById(`q-${field}`);
    if (!el) return;
    setNudged({ field, el });
    scrollToElement(el);
    el.classList.remove("er-field-nudge");
    void el.offsetWidth;
    el.classList.add("er-field-nudge");
    window.setTimeout(() => el.classList.remove("er-field-nudge"), 2600);
  };

  const tryGoToStep = (nextId: string) => {
    const missing = missingFor(currentId, data);
    if (seq.indexOf(nextId) > index && missing) {
      nudgeField(missing);
      return;
    }
    goToStep(nextId);
  };

  // Side-panel pencil: back to the step, then to the question.
  const editAnswer = (id: string, field: string) => {
    goToStep(id);
    window.setTimeout(() => {
      const el = document.getElementById(`q-${field}`);
      if (el) scrollToElement(el);
    }, 350);
  };

  const submit = async () => {
    // Every step must be complete and none may exit the funnel (tenant), not
    // only the current one: browser history can skip a step that changed.
    const blocking = firstBlockingStep(seq, (id) => missingFor(id, data), (id) => exitsAt(id, data));
    if (blocking) {
      const field = missingFor(blocking, data);
      if (blocking === currentId) {
        if (field) nudgeField(field);
        return;
      }
      goToStep(blocking);
      // Nudge once the blocking step is rendered and the scroll to top is done.
      if (field) window.setTimeout(() => nudgeField(field), 350);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(false);
    try {
      const phIds = {
        phDistinctId: ph?.get_distinct_id?.() ?? null,
        phSessionId: ph?.get_session_id?.() ?? null,
      };
      const token = miniQuoteSessionTokenRef.current;
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, lang, product, attribution: getAttributionCompact(), posthog: phIds, ...(token && { miniQuoteSessionToken: token }) }),
      });
      if (!res.ok) throw new Error("Submit failed");
      const result = await res.json();
      const dispatchable = result.dispatchable !== false;

      telemetry.trackSubmit(true, { submissionId: result.submissionId });
      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      try { ph?.capture("quote_submitted", { ...eventProps(), dispatchable }); } catch { /* noop */ }
      try { ph?.identify(String(data.email), { first_name: data.firstName, last_name: data.lastName, locale: lang }); } catch { /* noop */ }

      fetch("/api/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: telemetry.sessionToken,
          formType: "quote",
          locationPath: window.location.pathname,
          locationParams: window.location.search.slice(1) || null,
          locationRoute: "quote",
          locale: lang,
          userAgent: navigator.userAgent,
          user: { email: data.email, firstName: data.firstName, lastName: data.lastName, phone: data.phone },
          data,
          status: "success",
          posthog: phIds,
        }),
      }).catch(() => {});

      const confirmSegment = tq("steps.finalize.fields.confirmation_segment");
      const seg = confirmSegment.includes(".") || confirmSegment.startsWith("[") ? "confirmation" : confirmSegment;
      const qs = new URLSearchParams();
      const name = String(data.firstName ?? "").trim();
      if (name) qs.set("firstName", name);
      if (result.submissionId) qs.set("submissionId", result.submissionId);
      // Not dispatchable = not a lead for Ads: the success page skips its fallback conversion too.
      if (!dispatchable) qs.set("nd", "1");
      const redirect = () => {
        leavingRef.current = true;
        window.location.href = `/${lang}/${quoteSlug}/${seg}?${qs.toString()}`;
      };

      const leadSendTo = dispatchable ? adsSendTo(gc.google_ads, "quote_submit", product) : null;
      if (leadSendTo) {
        fireAdsConversion(leadSendTo, {
          transactionId: result.submissionId,
          userData: {
            email: String(data.email || "") || undefined,
            phone_number: formatPhoneE164(String(data.phone ?? ""), data.phoneCountry as CountryCode) || undefined,
            address: {
              first_name: String(data.firstName || "") || undefined,
              last_name: String(data.lastName || "") || undefined,
              postal_code: String(data.postalCode || "") || undefined,
              country: "CH",
            },
          },
          onDone: redirect,
        });
      } else {
        redirect();
      }
    } catch (err) {
      telemetry.trackSubmit(false, { error: String(err) });
      ph?.capture("quote_form_error", { ...eventProps(), error_message: String(err) });
      setSubmitError(true);
      setIsSubmitting(false);
    }
  };

  // Tenant exit of the battery funnel: the charger quote, with what is known.
  const ecpQuoteSlug = product !== "ecp" ? pageRegistry?.find((p) => p.id === "quote")?.slugs[lang] : undefined;
  const ecpQuote = ecpQuoteSlug
    ? `/${lang}/${ecpQuoteSlug}?${new URLSearchParams(
        Object.fromEntries(
          [...URL_PREFILL.map((k) => [k, data[k]] as const), ["sessionToken", miniQuoteSessionTokenRef.current] as const]
            .filter(([, v]) => typeof v === "string" && v),
        ) as Record<string, string>,
      )}`
    : undefined;

  const stepProps = { data, set, tq, tqOpt, tc, lang, pageConfig, hidden, links: { ecpQuote } };
  const answers = answerRows(funnel, seq.slice(0, index), data, tq, tqOpt);
  const mobileLine = isContact
    ? { icon: PhoneCall, text: `${tc("quote.rail.next.1")} · ${tc("quote.rail.next.1sub", slaVars)}` }
    : { icon: Landmark, text: subsidyLine(tc, subsidy) };
  const stepWhy = tqOpt(`steps.${currentId}.why`);
  const prefillChips = index === 0 && prefilled
    ? [
        prefilled.housingStatus && { icon: Home, label: tqOpt(`steps.housing.fields.housingStatus.options.${prefilled.housingStatus}`) ?? String(prefilled.housingStatus) },
        prefilled.postalCode && { icon: MapPin, label: `${prefilled.postalCode} ${prefilled.locality ?? ""}`.trim() },
      ].filter((c): c is { icon: typeof Home; label: string } => !!c)
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-b-paper" lang={lang} data-hide-layout data-direction-b>
      <QuoteHeader tc={tc} index={index} total={seq.length} logoSrc={logoSrc} logoDarkSrc={logoDarkSrc} mobileLine={mobileLine} />

      <div className="mx-auto w-full max-w-310 flex-1 px-5 pt-6 md:px-10 md:pt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-16">
        <main className="max-w-170 pb-10">
          {prefillChips.length > 0 && (
            <div className="mb-7 flex flex-wrap items-center gap-2.5 rounded-lg bg-b-inset px-3.5 py-3 text-[15px]">
              <CheckCircle2 className="size-4.5 text-b-link" aria-hidden />
              <span className="text-muted-foreground">{tc("quote.prefill.label")}</span>
              {prefillChips.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 font-semibold whitespace-nowrap">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                  {label}
                </span>
              ))}
              <button
                type="button"
                className="ml-auto h-7.5 px-2 text-sm font-semibold text-b-link underline underline-offset-3"
                onClick={() => {
                  const el = document.getElementById("q-housingStatus");
                  if (!el) return;
                  scrollToElement(el);
                  el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true });
                }}
              >
                {tc("quote.prefill.edit")}
              </button>
            </div>
          )}

          <div className="mb-8">
            <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-tight md:text-4xl">{tq(`steps.${currentId}.title`)}</h1>
            {stepWhy && <p className="mt-2.5 text-base leading-relaxed text-muted-foreground">{stepWhy}</p>}
          </div>

          <div className="flex flex-col gap-8">
            {productStep && <productStep.Component {...stepProps} />}
            {isContact && (
              <ContactStep
                {...stepProps}
                patch={patch}
                slaVars={slaVars}
                onSubmit={submit}
                onBack={index > 0 ? () => goToStep(seq[index - 1]) : undefined}
                isSubmitting={isSubmitting}
                submitError={submitError}
                focusStreet={!!prefilled?.postalCode}
              />
            )}
          </div>
        </main>

        <div className="hidden lg:block">
          <Rail tc={tc} tq={tq} gc={gc} subsidy={subsidy} offer={offer} last={isContact} answers={answers} onEdit={editAnswer} />
        </div>
      </div>

      {/* The missing-answer message sits under the question it is about. */}
      {nudged && nudged.el.isConnected &&
        createPortal(
          <p role="alert" className="mt-2.5 flex items-center gap-2 text-sm font-medium text-(--destructive-border)">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {tc("quote.missing")}
          </p>,
          nudged.el,
        )}

      {/* Between steps only: the contact step sends from inside the flow. */}
      {!isContact && (
        <footer className="sticky bottom-0 z-40 border-t border-border bg-b-paper/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-310 flex-col-reverse gap-1 px-5 pt-3 pb-4 sm:flex-row sm:items-center sm:gap-3 md:px-10 md:py-4">
            {index > 0 && (
              <button type="button" onClick={() => goToStep(seq[index - 1])}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-semibold text-muted-foreground hover:text-foreground sm:h-12"
                data-testid="button-back">
                <ArrowLeft className="size-4" aria-hidden />
                {tq("navigation.back")}
              </button>
            )}
            {exited ? (
              <Link href={`/${lang}`}
                className="inline-flex h-13 items-center justify-center gap-2.5 rounded-md border-[1.5px] border-foreground px-6.5 text-base font-semibold sm:ml-auto"
                data-testid="button-exit-home">
                {tq("navigation.home")}
              </Link>
            ) : (
              <button ref={nextButtonRef} type="button" onClick={() => tryGoToStep(seq[index + 1])}
                className="inline-flex h-13 items-center justify-center gap-2.5 rounded-md bg-b-forest px-6.5 text-base font-semibold text-b-on-forest transition hover:brightness-125 sm:ml-auto dark:bg-b-on-forest dark:text-b-forest"
                data-testid="button-next">
                {tq("navigation.next")}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
