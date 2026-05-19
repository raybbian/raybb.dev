"use client";

import { createContext, useContext, type ReactNode } from "react";

// One scope per paragraph. Inline <Footnote>s register into a plain
// per-render collector during the paragraph's render; <FootnoteList> is a
// *later sibling*, so by the time it renders the collector is populated —
// no refs, no effects, no flash. Entries are de-duped by number.

export type FootnoteEntry = { n: number; content: ReactNode };
type ScopeCtx = { register: (e: FootnoteEntry) => void };

const Ctx = createContext<ScopeCtx | null>(null);

export function useFootnoteScope(): ScopeCtx | null {
  return useContext(Ctx);
}

export function FootnoteScope({ children }: { children: ReactNode }) {
  // Fresh array each render: child <Footnote>s push during the children
  // subtree render, the <FootnoteList> sibling reads it afterwards.
  const collector: FootnoteEntry[] = [];
  return (
    <Ctx.Provider value={{ register: (e) => collector.push(e) }}>
      {children}
      <FootnoteList entries={collector} />
    </Ctx.Provider>
  );
}

function FootnoteList({ entries }: { entries: FootnoteEntry[] }) {
  const seen = new Map<number, ReactNode>();
  for (const e of entries) if (!seen.has(e.n)) seen.set(e.n, e.content);
  if (seen.size === 0) return null;
  const items = [...seen.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="ink-3 mt-2 mb-4 space-y-1 border-l-2 border-white/10 pl-4 text-sm">
      {items.map(([n, content]) => (
        <p key={n} id={`fn-${n}`} className="leading-relaxed">
          <a
            href={`#fnref-${n}`}
            className="accent mr-1.5 font-medium no-underline"
          >
            {n}.
          </a>
          {content}
        </p>
      ))}
    </div>
  );
}
