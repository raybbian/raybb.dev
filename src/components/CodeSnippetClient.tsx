"use client";

import { useState } from "react";

type Props = {
  html: string;
  name?: string;
  lang: string;
  collapsedHeight: number;
};

export function CodeSnippetClient({ html, name, lang, collapsedHeight }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="code-snippet my-6 overflow-hidden rounded-xl border border-white/10 bg-black/50 text-sm leading-relaxed backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
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
              expanded ? "rotate-180" : "rotate-0"
            }`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div className="relative">
        <div
          className={expanded ? "overflow-auto" : "overflow-hidden"}
          style={expanded ? undefined : { maxHeight: `${collapsedHeight}px` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!expanded && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/50 to-transparent"
          />
        )}
      </div>
    </div>
  );
}
