"use client";

import { useSyncExternalStore } from "react";
import { FaMoon, FaSun } from "react-icons/fa6";
import { useTheme, type Theme } from "@/lib/useTheme";

// Mounted flag (server = false, client = true), used to suppress the icon
// rotation on first paint so a dark-mode visitor doesn't see the
// sun-to-moon transition play once on hydrate.
const noopSubscribe = () => () => {};

export default function ThemeToggle() {
  const theme = useTheme();
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
      className="frost ink fixed bottom-5 right-5 z-50 grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-black/50"
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
