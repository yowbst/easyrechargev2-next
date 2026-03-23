"use client";

import { useEffect, useState } from "react";

export function EnvBadge() {
  const [env, setEnv] = useState<"dev" | "staging" | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      setEnv("dev");
    } else if (host.includes("-staging") || host.includes("staging.")) {
      setEnv("staging");
    }
  }, []);

  if (!env) return null;

  const label = env === "dev" ? "DEV" : "STAGING";
  const colors =
    env === "dev"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";

  return (
    <span
      className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${colors}`}
    >
      {label}
    </span>
  );
}
