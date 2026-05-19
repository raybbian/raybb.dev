"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// data-theme lives on <html>; a pre-paint script sets it before hydration.
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
};

const read = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

// SSR has no data-theme yet, so match the pre-paint script's default.
const server = (): Theme => "light";

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, server);
}
