"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Reports whether `ref` intersects the viewport (expanded by `rootMargin`).
// Used to lazily spin up — and pause — expensive canvas figures.
export function useInView<T extends Element = HTMLElement>(
  rootMargin = "300px 0px",
): { ref: RefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  // No IntersectionObserver (old browsers / SSR) ⇒ assume visible so the
  // figure still loads. The boolean alone produces no SSR DOM difference.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
