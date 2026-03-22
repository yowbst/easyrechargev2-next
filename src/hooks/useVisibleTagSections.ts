import { useState, useEffect, useCallback, useRef } from "react";

interface TagInfo {
  id: string;
  slug: string;
  name: string;
  count: number;
}

interface UseVisibleTagSectionsResult {
  visibleTagIds: Set<string>;
  hiddenTags: TagInfo[];
  registerSection: (tagId: string, element: HTMLElement | null) => void;
}

export function useVisibleTagSections(
  tags: TagInfo[],
): UseVisibleTagSectionsResult {
  const [visibleTagIds, setVisibleTagIds] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsMapRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleTagIds((prev) => {
          const next = new Set(prev);
          let changed = false;

          entries.forEach((entry) => {
            const tagId = entry.target.getAttribute("data-tag-id");
            if (!tagId) return;

            if (entry.isIntersecting) {
              if (!next.has(tagId)) {
                next.add(tagId);
                changed = true;
              }
            } else {
              if (next.has(tagId)) {
                next.delete(tagId);
                changed = true;
              }
            }
          });

          return changed ? next : prev;
        });
      },
      {
        rootMargin: "-64px 0px 0px 0px",
        threshold: 0.25,
      },
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;

    elementsMapRef.current.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      elementsMapRef.current.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, [tags]);

  const registerSection = useCallback(
    (tagId: string, element: HTMLElement | null) => {
      const observer = observerRef.current;

      if (element) {
        element.setAttribute("data-tag-id", tagId);
        elementsMapRef.current.set(tagId, element);
        if (observer) {
          observer.observe(element);
        }
      } else {
        const existingElement = elementsMapRef.current.get(tagId);
        if (existingElement && observer) {
          observer.unobserve(existingElement);
        }
        elementsMapRef.current.delete(tagId);
      }
    },
    [],
  );

  const hiddenTags = tags.filter((tag) => !visibleTagIds.has(tag.id));

  return {
    visibleTagIds,
    hiddenTags,
    registerSection,
  };
}
