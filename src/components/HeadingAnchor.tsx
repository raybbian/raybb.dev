"use client";

import { useState } from "react";

export default function HeadingAnchor({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers / insecure contexts: still update hash so the user can
      // copy from the address bar.
    }
    history.replaceState(null, "", `#${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <span className="relative ml-2 inline-flex items-baseline align-baseline">
      <button
        type="button"
        onClick={onClick}
        aria-label={`Copy link to ${id}`}
        className="ink-3 hover:ink text-[0.7em] font-normal opacity-0 transition-opacity duration-150 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
      >
        #
      </button>
      {copied && (
        <span
          role="status"
          className="frost ink-2 pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-normal"
        >
          Copied!
        </span>
      )}
    </span>
  );
}
