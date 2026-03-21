"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchLocalities, type LocalityResponse } from "@/lib/localities";

type CacheEntry = { ts: number; data: LocalityResponse[] };

export function useLocalitySearch(
  term: string,
  opts?: {
    limit?: number;
    debounceMs?: number;
    minChars?: number;
    cacheTtlMs?: number;
    locale?: string;
  },
) {
  const limit = opts?.limit ?? 5;
  const debounceMs = opts?.debounceMs ?? 300;
  const minChars = opts?.minChars ?? 2;
  const cacheTtlMs = opts?.cacheTtlMs ?? 5 * 60 * 1000;
  const locale = opts?.locale;

  const [items, setItems] = useState<LocalityResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  useEffect(() => {
    const q = term.trim();

    if (q.length < minChars) {
      abortRef.current?.abort();
      setItems([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${locale || "default"}::${q}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      setItems(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const data = await searchLocalities(q, limit, ac.signal, locale);
        cacheRef.current.set(cacheKey, { ts: Date.now(), data });
        setItems(data);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [term, limit, debounceMs, minChars, cacheTtlMs, locale]);

  return useMemo(() => ({ items, loading }), [items, loading]);
}
