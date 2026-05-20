"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  html: string;
  name?: string;
  lang: string;
  collapsedHeight: number;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-300 ease-out ${
        open ? "rotate-180" : "rotate-0"
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CodeSnippetClient({ html, name, lang, collapsedHeight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  // Measured natural height of the code block; null until hydration. Shiki
  // output doesn't reflow with viewport width (pre.shiki uses overflow-x),
  // so a single measurement is stable.
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    if (innerRef.current) {
      setContentHeight(innerRef.current.scrollHeight);
    }
  }, []);

  const measured = contentHeight ?? collapsedHeight;
  const height = expanded ? measured : Math.min(collapsedHeight, measured);
  const toggle = () => setExpanded((v) => !v);

  return (
    <div className="code-snippet my-6 overflow-hidden rounded-xl border border-white/10 bg-black/50 text-sm leading-relaxed backdrop-blur-sm">
      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse code" : "Expand code"}
        className="flex w-full cursor-pointer items-center justify-between border-b border-white/10 px-4 py-2 text-xs transition-opacity hover:opacity-70"
      >
        {name ? (
          <span className="ink-2 font-mono">{name}</span>
        ) : (
          <span className="ink-3 font-mono uppercase tracking-wider">
            {lang}
          </span>
        )}
        <span className="accent flex items-center gap-1.5">
          <span>{expanded ? "Collapse" : "Expand"}</span>
          <Chevron open={expanded} />
        </span>
      </button>
      <div className="relative">
        <div
          className="overflow-hidden transition-[height] duration-300 ease-out"
          style={{ height: `${height}px` }}
        >
          <div ref={innerRef} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        {!expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/50 to-transparent"
          />
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse code" : "Expand code"}
        className="accent flex w-full cursor-pointer items-center justify-center py-1.5 transition-opacity hover:opacity-70"
      >
        <Chevron open={expanded} />
      </button>
    </div>
  );
}
