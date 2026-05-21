import { type ReactNode } from "react";

// Inline footnote marker. `n` is injected by remark-number-footnotes.mjs at
// MDX-compile time; the enclosing <FootnoteScope> picks up children (the
// note body) by walking its subtree, so this component itself only emits
// the superscript link.
export function Footnote({ n }: { n: number; children?: ReactNode }) {
  return (
    <sup id={`fnref-${n}`} className="ml-0.5 text-xs">
      <a href={`#fn-${n}`} className="accent no-underline">
        {n}
      </a>
    </sup>
  );
}
