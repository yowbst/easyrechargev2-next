"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Clock, Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DisqualifyModal } from "@/components/partners/DisqualifyModal";
import { LostModal } from "@/components/partners/LostModal";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import type { ActionBlocker, DispatchAction } from "@/lib/dispatch/action-token";
import { makePartnerT, partnerT, type PartnerDict } from "@/lib/partner-i18n";
import { emailActionCopy, type EmailActionKey } from "./email-action-copy";

export type EmailActionState = "ready" | "expired" | ActionBlocker;

type Phase =
  | { kind: "ready" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "blocked"; state: Exclude<EmailActionState, "ready"> }
  | { kind: "error" };

/**
 * Confirmation step behind an e-mail action link. Nothing is written until
 * the partner confirms: Lost and Disqualify reuse the kanban's modals (reason
 * required), every other stage is a single Confirm button.
 */
export function EmailActionConfirm({
  token,
  action,
  initialState,
  dispatch,
  dictionary,
  allowedReasons,
  lang,
  leadsHref,
}: {
  token: string;
  action: DispatchAction;
  initialState: EmailActionState;
  dispatch: PartnerDispatchCard;
  dictionary: PartnerDict;
  allowedReasons: string[] | null;
  lang: "fr" | "de";
  leadsHref: string;
}) {
  const t = makePartnerT(dictionary);
  // Directus first (`email_action.*`), local copy otherwise.
  const c = (key: EmailActionKey, vars?: Record<string, string>) => {
    const fromDict = partnerT(dictionary, `email_action.${key}`, vars);
    if (!fromDict.startsWith("[")) return fromDict;
    let v: string = emailActionCopy(lang, key);
    for (const [k, val] of Object.entries(vars ?? {})) v = v.replaceAll(`{${k}}`, val);
    return v;
  };

  const [phase, setPhase] = useState<Phase>(
    initialState === "ready" ? { kind: "ready" } : { kind: "blocked", state: initialState },
  );

  const submit = async (reason?: string, note?: string) => {
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/partners/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason, note }),
      });
      if (res.ok) return setPhase({ kind: "done" });
      const { error } = await res.json().catch(() => ({ error: null }));
      if (error === "window_expired") return setPhase({ kind: "blocked", state: "billing_locked" });
      if (["expired", "already_done", "already_disqualified", "billing_locked"].includes(error)) {
        return setPhase({ kind: "blocked", state: error });
      }
      setPhase({ kind: "error" });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  const leaveToLeads = () => window.location.assign(leadsHref);
  const needsReason = action === "lost" || action === "disqualify";

  const data = (dispatch.submission?.data ?? {}) as Record<string, unknown>;
  const user = dispatch.submission?.user ?? null;
  const who = [user?.first_name, user?.last_name ? `${user.last_name[0]}.` : null].filter(Boolean).join(" ");
  const where = [data.postalCode, data.locality].filter((v) => typeof v === "string" && v).join(" ");
  const date = new Date(dispatch.dispatched_at).toLocaleDateString(lang === "de" ? "de-CH" : "fr-CH");

  const fromLabel = t(`stages.${dispatch.stage}`);
  const toLabel = action === "disqualify" ? "" : t(`stages.${action}`);

  if (phase.kind === "ready" && needsReason) {
    return (
      <TooltipProvider delay={250}>
        {action === "lost" ? (
          <LostModal
            open
            onClose={leaveToLeads}
            onConfirm={(reason, note) => submit(reason, note)}
            dispatch={dispatch}
            dictionary={dictionary}
          />
        ) : (
          <DisqualifyModal
            open
            onClose={leaveToLeads}
            onConfirm={(reason, note) => submit(reason, note)}
            allowedReasons={allowedReasons}
            dispatch={dispatch}
            dictionary={dictionary}
          />
        )}
      </TooltipProvider>
    );
  }

  let icon = <CheckCircle2 className="size-7 text-primary" aria-hidden />;
  let title: string;
  let body: string | null = null;
  switch (phase.kind) {
    case "ready":
    case "sending":
      icon = <Clock className="size-7 text-muted-foreground" aria-hidden />;
      title = c(`confirm.${action}` as EmailActionKey);
      body = c("confirm.move", { from: fromLabel, to: toLabel });
      break;
    case "done":
      title = c("done.title");
      body = action === "disqualify" ? c("done.disqualified") : c("done.stage", { to: toLabel });
      break;
    case "blocked":
      icon = <CircleAlert className="size-7 text-muted-foreground" aria-hidden />;
      title = c(`${phase.state}.title` as EmailActionKey);
      body = c(`${phase.state}.body` as EmailActionKey, { stage: fromLabel });
      break;
    case "error":
      icon = <CircleAlert className="size-7 text-destructive" aria-hidden />;
      title = c("error");
      break;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          {icon}
          <p className="text-sm text-muted-foreground">
            {[who, where].filter(Boolean).join(" · ")}
            <br />
            {c("dispatched_on", { date })}
          </p>
        </div>
        <h1 className="font-heading text-xl font-semibold leading-tight tracking-tight">{title}</h1>
        {body && <p className="mt-2 text-[15px] text-muted-foreground">{body}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <a
            href={leadsHref}
            className="inline-flex h-11 items-center justify-center rounded-md border px-4.5 text-[15px] font-semibold transition-colors hover:bg-muted"
          >
            {c("open_leads")}
          </a>
          {(phase.kind === "ready" || phase.kind === "sending") && (
            <button
              type="button"
              onClick={() => submit()}
              disabled={phase.kind === "sending"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4.5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {phase.kind === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {c("confirm.button")}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
