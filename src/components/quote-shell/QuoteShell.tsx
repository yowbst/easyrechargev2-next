"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, ChevronLeft, ChevronRight, Home, Loader2, User } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/quote/ProgressBar";
import { firstUnansweredField as sharedFirstUnanswered, type StepFields } from "@/components/quote/stepValidation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePostHog } from "@/components/PostHogProvider";
import { useFormTelemetry } from "@/hooks/use-form-telemetry";
import { getAttributionCompact } from "@/lib/attribution";
import { adsSendTo, fireAdsConversion } from "@/lib/googleAds";
import { formatPhoneE164 } from "@/lib/phone-utils";
import { parseQuoteDraft, quoteDraftKey, serializeQuoteDraft } from "@/lib/quoteDraft";
import type { PublicQuoteConfig } from "@/lib/public-config";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { Product } from "@/lib/products";
import { makeShellT } from "./dictionary";
import { CONTACT, FINALIZE, WELCOME, clampToFirstIncomplete, stepSequence } from "./navigation";
import { stepConfig } from "./pageConfig";
import { getFunnel } from "./funnels";
import { WelcomeStep } from "./WelcomeStep";
import { ContactStep } from "./ContactStep";
import { FinalizeStep } from "./FinalizeStep";
import type { FormValues } from "./types";

const SHARED_INITIAL: FormValues = {
  firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
  addressMode: "google", address: "", country: "CH",
  approval: "", comment: "", acceptTerms: false,
};

interface QuoteShellProps {
  product: Product;
  lang: string;
  dictionary: Record<string, string>;
  quoteSlug: string;
  pageConfig?: Record<string, unknown>;
  heroImage?: string;
  globalConfig?: PublicQuoteConfig;
  logoSrc?: string;
  logoDarkSrc?: string;
  pageRegistry?: PageRegistryEntry[];
  /** Answers carried over from another funnel (sub-project D). */
  prefill?: FormValues;
}

export function QuoteShell({
  product, lang, dictionary, quoteSlug, pageConfig = {}, heroImage,
  globalConfig: gc = {}, logoSrc, logoDarkSrc, pageRegistry, prefill,
}: QuoteShellProps) {
  const funnel = getFunnel(product);
  const { tq, tqOpt } = useMemo(() => makeShellT(dictionary, funnel.dictPageIds), [dictionary, funnel]);
  const ph = usePostHog();
  const telemetry = useFormTelemetry({ formType: "quote", locale: lang });
  const draftKey = quoteDraftKey(product);

  const [data, setData] = useState<FormValues>(() => ({ ...SHARED_INITIAL, ...funnel.initialData, ...prefill }));
  const [stepId, setStepId] = useState<string>(WELCOME);
  const [showMissingHint, setShowMissingHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const miniQuoteSessionTokenRef = useRef<string | null>(null);

  const missingFor = (id: string, d: FormValues): string | null => {
    if (id === WELCOME) return null;
    if (id === CONTACT) return sharedFirstUnanswered(5, d as unknown as StepFields);
    if (id === FINALIZE) return sharedFirstUnanswered(6, d as unknown as StepFields);
    return funnel.firstUnansweredField(id, d);
  };

  const seq = stepSequence(funnel.steps, data);
  const index = Math.max(0, seq.indexOf(stepId));
  const currentId = seq[index];
  const productStep = funnel.steps.find((s) => s.id === currentId);
  const exited = productStep?.exit?.(data) ?? false;
  const missingField = missingFor(currentId, data);
  const StepIcon = productStep?.icon ?? (currentId === CONTACT ? User : CheckCircle);

  // Restore the draft, read mini-quote hand-off params, land on the right step.
  useEffect(() => {
    let restored: FormValues = {};
    try {
      restored = parseQuoteDraft(sessionStorage.getItem(draftKey), Date.now()) ?? {};
    } catch { /* storage unavailable (private mode) — start fresh */ }

    const params = new URLSearchParams(window.location.search);
    const fromUrl: FormValues = {};
    for (const key of ["locality", "postalCode", "housingStatus"]) {
      const v = params.get(key);
      if (v) fromUrl[key] = v;
    }
    const token = params.get("sessionToken");
    if (token) miniQuoteSessionTokenRef.current = token;

    const merged = { ...SHARED_INITIAL, ...funnel.initialData, ...prefill, ...restored, ...fromUrl };
    setData(merged);
    setStepId(clampToFirstIncomplete(stepSequence(funnel.steps, merged), params.get("step"), (id) => missingFor(id, merged)));
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

  // Browser back/forward.
  useEffect(() => {
    const onPop = () => setStepId(new URLSearchParams(window.location.search).get("step") ?? WELCOME);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const eventProps = () => ({
    form_type: "quote",
    product,
    locale: lang,
    entry_point: miniQuoteSessionTokenRef.current ? "mini-quote" : "direct",
  });

  const set = (field: string, value: unknown) => {
    if (showMissingHint) setShowMissingHint(false);
    telemetry.trackChange(field, String(value));
    setData((prev) => funnel.applyChange(field, value, prev));
  };
  const patch = (updates: FormValues) => setData((prev) => ({ ...prev, ...updates }));

  const goToStep = (nextId: string) => {
    const nextIndex = seq.indexOf(nextId);
    if (nextIndex > index) {
      ph?.capture("quote_step_completed", { ...eventProps(), step: index, step_name: currentId });
      if (currentId === WELCOME) {
        const startSendTo = adsSendTo(gc.google_ads, "quote_start", product);
        if (startSendTo) fireAdsConversion(startSendTo);
      }
    }
    ph?.capture("quote_step_viewed", { ...eventProps(), step: nextIndex, step_name: nextId });
    const url = new URL(window.location.href);
    url.searchParams.set("step", nextId);
    history.pushState({}, "", url.toString());
    setStepId(nextId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Same nudge as QuoteForm: scroll to the missing question and pulse it.
  const nudgeField = (field: string) => {
    setShowMissingHint(true);
    ph?.capture("quote_missing_answer_nudge", { ...eventProps(), step: index, field });
    const el = document.getElementById(`q-${field}`);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    el.classList.remove("er-field-nudge");
    void el.offsetWidth;
    el.classList.add("er-field-nudge");
    window.setTimeout(() => el.classList.remove("er-field-nudge"), 2600);
  };

  const tryGoToStep = (nextId: string) => {
    if (seq.indexOf(nextId) > index && missingField) {
      nudgeField(missingField);
      return;
    }
    setShowMissingHint(false);
    goToStep(nextId);
  };

  const submit = async () => {
    if (missingField) {
      nudgeField(missingField);
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
      const redirect = () => { window.location.href = `/${lang}/${quoteSlug}/${seg}?${qs.toString()}`; };

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

  const stepProps = { data, set, tq, tqOpt, lang, pageConfig };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" data-hide-layout data-direction-b>
      <div className="py-4 md:py-6 bg-background">
        <div className="container mx-auto px-4 flex justify-between items-center md:grid md:grid-cols-3">
          <div className="hidden md:block" />
          <div className="flex md:justify-center">
            <Link href={`/${lang}`} data-testid="link-logo-home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc || "/logo-color.svg"} alt="easyRecharge" className="h-8 md:h-10 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDarkSrc || "/logo-white.svg"} alt="easyRecharge" className="h-8 md:h-10 w-auto hidden dark:block" />
            </Link>
          </div>
          <div className="flex justify-end items-center gap-2">
            <LanguageSwitcher pageRegistry={pageRegistry} />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="flex-1 py-4 md:py-6 pb-32">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {index > 0 && (
              <ProgressBar
                currentStep={index}
                totalSteps={seq.length - 1}
                onStepClick={(s) => (s < index ? goToStep(seq[s]) : tryGoToStep(seq[s]))}
                className="mb-4"
              />
            )}

            <Card className={`rounded-2xl border border-border/80 shadow-sm ${currentId === WELCOME ? "overflow-hidden pt-0 gap-0" : "p-6"}`}>
              {currentId === WELCOME ? (
                <WelcomeStep tq={tq} heroImage={heroImage} globalConfig={gc} offer={stepConfig(pageConfig, WELCOME).offer as Parameters<typeof WelcomeStep>[0]["offer"]} />
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-border/60">
                    <StepIcon className="h-6 w-6 text-primary flex-shrink-0" />
                    <h2 className="text-2xl font-heading font-bold">{tq(`steps.${currentId}.title`)}</h2>
                  </div>
                  {productStep && <productStep.Component {...stepProps} />}
                  {currentId === CONTACT && <ContactStep {...stepProps} patch={patch} />}
                  {currentId === FINALIZE && <FinalizeStep {...stepProps} />}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border/60 shadow-lg z-50 py-3">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              {showMissingHint && missingField && (
                <p className="text-xs text-destructive text-center mb-2" role="status">
                  {tqOpt("navigation.missingAnswer") ??
                    (lang === "de"
                      ? "Oben fehlt noch eine Antwort — wir haben sie für Sie markiert."
                      : "Il manque une réponse ci-dessus — nous vous y avons amené.")}
                </p>
              )}
              {currentId === WELCOME ? (
                <Button size="lg" onClick={() => tryGoToStep(seq[1])} className="w-full font-semibold" data-testid="button-start-quote">
                  {tq("welcome.cta")}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <div className="flex gap-3">
                  {index > 1 && (
                    <Button size="lg" variant="outline" onClick={() => goToStep(seq[index - 1])} className="font-semibold" data-testid="button-back">
                      <ChevronLeft className="mr-2 h-5 w-5" />
                      {tq("navigation.back")}
                    </Button>
                  )}
                  {exited ? (
                    <Link href={`/${lang}`} className={cn(buttonVariants({ size: "lg" }), "flex-1 font-semibold")} data-testid="button-exit-home">
                      <Home className="mr-2 h-5 w-5" />
                      {tq("navigation.home")}
                    </Link>
                  ) : currentId === FINALIZE ? (
                    <Button size="lg" onClick={submit} disabled={isSubmitting} className={`flex-1 font-semibold${missingField ? " opacity-60" : ""}`} data-testid="button-submit">
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : tq("steps.finalize.submit")}
                    </Button>
                  ) : (
                    <Button size="lg" onClick={() => tryGoToStep(seq[index + 1])} className={`flex-1 font-semibold${missingField ? " opacity-60" : ""}`} data-testid="button-next">
                      {tq("navigation.next")}
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </Button>
                  )}
                </div>
              )}
              {submitError && <p className="text-xs text-destructive text-center w-full mt-1">{tq("steps.finalize.submitError")}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
