"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Post-scoped sequential footnote numbering. One provider wraps a whole post;
// each <Footnote> claims the next number on mount (document order).
type FootnotesCtx = { allocate: () => number };

const Ctx = createContext<FootnotesCtx | null>(null);

export function useFootnotes(): FootnotesCtx {
  // Fallback keeps <Footnote> usable outside a post (numbers from 1).
  return useContext(Ctx) ?? { allocate: () => 1 };
}

export function FootnotesProvider({ children }: { children: ReactNode }) {
  // Closure counter, created once; stable identity for consumers.
  const [value] = useState<FootnotesCtx>(() => {
    let n = 0;
    return { allocate: () => (n += 1) };
  });
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
