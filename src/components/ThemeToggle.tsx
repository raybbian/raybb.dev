"use client";

import { useSyncExternalStore } from "react";
import { FaMoon, FaSun } from "react-icons/fa6";

type Theme = "light" | "dark";

// MutationObserver so the button stays in sync if anything else mutates
// data-theme (devtools, a future second toggle).
const subscribeTheme = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
};

const readTheme = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

// SSR has no data-theme yet (pre-paint script runs in the browser only), so
// default to light. The hydrated render reads the actual attribute.
const themeOnServer = (): Theme => "light";

// Mounted flag (server = false, client = true), used to suppress the icon
// rotation on first paint so a dark-mode visitor doesn't see the
// sun-to-moon transition play once on hydrate.
const noopSubscribe = () => () => {};

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    themeOnServer,
  );
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const isDark = theme === "dark";

  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      onClick={toggle}
      suppressHydrationWarning
      className="frost fixed bottom-5 right-5 z-50 grid h-11 w-11 place-items-center rounded-full text-white transition-colors hover:bg-white/30 dark:hover:bg-black/50"
    >
      <span className="relative grid h-4 w-4 place-items-center">
        <FaSun
          aria-hidden
          className={`absolute transition-all ${mounted ? "duration-500" : "duration-0"} motion-reduce:duration-200 motion-reduce:!rotate-0 ${
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <FaMoon
          aria-hidden
          className={`absolute transition-all ${mounted ? "duration-500" : "duration-0"} motion-reduce:duration-200 motion-reduce:!rotate-0 ${
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </span>
    </button>
  );
}
