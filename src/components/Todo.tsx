import type { ReactNode } from "react";

// Inline "work in progress" badge for unfinished blog sections. Renders a
// red alert pill so the gap reads as intentional instead of a typo.
export function Todo({ children }: { children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="my-6 flex items-center gap-3 rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-3 text-red-100 shadow-sm shadow-red-900/20 backdrop-blur-sm"
    >
      <span
        aria-hidden
        className="inline-flex h-6 shrink-0 items-center rounded-md bg-red-500/90 px-2 text-xs font-bold tracking-wider text-white uppercase"
      >
        Todo
      </span>
      <span className="text-sm leading-snug">
        {children ?? "This section is still being written."}
      </span>
    </div>
  );
}
