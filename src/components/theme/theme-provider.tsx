"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode / quota — fall through */
  }
  return "system";
}

function readSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Minimal in-tree replacement for next-themes that avoids the React 19
 * "script tag while rendering React component" warning by leaving the
 * FOUC-prevention script to a separate server-rendered injection
 * (see `theme-script.tsx`) instead of emitting a JSX `<script>` here.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe defaults; reconcile with localStorage + system on mount.
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemResolved, setSystemResolved] =
    useState<ResolvedTheme>("light");

  useEffect(() => {
    setThemeState(readStoredTheme());
    setSystemResolved(readSystemPreference());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setSystemResolved(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? systemResolved : theme;

  // Mirror the resolved theme onto <html>. The FOUC script has already done
  // this on the first paint; this keeps it in sync on every change.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Permissive fallback so callers can render before the provider mounts
  // (or in tests). Mirrors next-themes' behaviour of returning sane defaults.
  return {
    theme: "system",
    resolvedTheme: "light",
    setTheme: () => {},
  };
}
