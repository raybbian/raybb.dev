"use client";

import { useEffect } from "react";
import { sections } from "@/content/profile";

// Reflects the section in view into the URL hash using replaceState, so the
// back button isn't flooded with one entry per scroll.
export default function ScrollSpy() {
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((e): e is HTMLElement => e !== null);

    let current = "";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.id !== current) {
            current = e.target.id;
            const hash = current === "home" ? "/" : `/#${current}`;
            history.replaceState(null, "", hash);
            window.dispatchEvent(
              new CustomEvent("koi:section", { detail: current }),
            );
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
