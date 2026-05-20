"use client";

import { createContext, useContext, type ReactNode } from "react";
import BlogToc from "./BlogToc";

// Post-scoped TOC collection, modeled on FootnoteScope. Each heading pushes
// into a fresh per-render collector during its own render; <BlogToc>, a
// later sibling under the same provider, reads the populated array. Pushes
// from StrictMode's render double-invocation land in the same collector
// and are deduped by id in <BlogToc>.

export type TocEntry = { id: string; text: string; level: 2 | 3 };

type Ctx = { register: (e: TocEntry) => void };

const TocContext = createContext<Ctx | null>(null);

export function useTocScope(): Ctx | null {
  return useContext(TocContext);
}

export function TocProvider({ children }: { children: ReactNode }) {
  const collector: TocEntry[] = [];
  return (
    <TocContext.Provider value={{ register: (e) => collector.push(e) }}>
      {children}
      <BlogToc entries={collector} />
    </TocContext.Provider>
  );
}
