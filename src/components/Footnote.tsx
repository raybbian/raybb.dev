"use client";

import { useRef, type ReactNode } from "react";
import { useFootnotes } from "./FootnotesProvider";
import { useFootnoteScope } from "./FootnoteScope";

// Inline footnote: renders a superscript number where written; the note text
// is collected by the enclosing paragraph's <FootnoteScope> and shown in
// small muted text directly beneath that paragraph.
export function Footnote({ children }: { children: ReactNode }) {
  const { allocate } = useFootnotes();
  const scope = useFootnoteScope();
  // Claim a number once, in document order. Guarded by a ref rather than a
  // useState initializer: StrictMode double-invokes state initializers in
  // dev, which would call the render-time `allocate` counter twice on the
  // client but once on the server, drifting numbers and breaking hydration.
  // The ref persists across the double render, so allocate fires exactly
  // once per instance on both server and client.
  const ref = useRef(0);
  if (ref.current === 0) ref.current = allocate();
  const n = ref.current;
  scope?.register({ n, content: children });

  return (
    <sup id={`fnref-${n}`} className="ml-0.5 text-xs">
      <a href={`#fn-${n}`} className="accent no-underline">
        {n}
      </a>
    </sup>
  );
}
