"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sections } from "@/content/profile";

const hashSection = () =>
  (typeof window !== "undefined" &&
    window.location.hash.replace("#", "")) ||
  "home";

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(hashSection);
  const pathname = usePathname();
  const router = useRouter();

  // "blog" on blog routes, otherwise the section in view. Derived in render;
  // `section` is only mutated from event callbacks (no setState in effects).
  const active = pathname.startsWith("/blog") ? "blog" : section;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onSection = (e: Event) =>
      setSection((e as CustomEvent<string>).detail);
    const onHash = () => setSection(hashSection());
    window.addEventListener("keydown", onKey);
    window.addEventListener("koi:section", onSection);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("koi:section", onSection);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const goToSection = (id: string) => {
    setOpen(false);
    if (pathname === "/") {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", id === "home" ? "/" : `/#${id}`);
      }
    } else {
      router.push(id === "home" ? "/" : `/#${id}`);
    }
  };

  return (
    <>
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="fixed right-5 top-5 z-50 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md transition-colors hover:bg-white/20"
      >
        <span className="relative block h-4 w-5">
          <span
            className={`absolute left-0 top-0 h-0.5 w-full rounded-full bg-white transition-transform duration-300 ${
              open ? "translate-y-[7px] rotate-45" : ""
            }`}
          />
          <span
            className={`absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 rounded-full bg-white transition-opacity duration-300 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-white transition-transform duration-300 ${
              open ? "-translate-y-[7px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <nav
        className={`fixed right-0 top-0 z-40 flex h-full w-72 max-w-[80vw] flex-col gap-0.5 border-l border-white/15 bg-white/10 px-5 pt-20 backdrop-blur-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => goToSection(s.id)}
            aria-current={active === s.id ? "true" : undefined}
            className={`rounded-lg px-3 py-2 text-left text-xl font-semibold transition-colors hover:bg-white/10 hover:text-white ${
              active === s.id
                ? "bg-white/10 text-white"
                : "text-white/80"
            }`}
          >
            {s.label}
          </button>
        ))}
        <Link
          href="/blog"
          onClick={() => setOpen(false)}
          aria-current={active === "blog" ? "true" : undefined}
          className={`rounded-lg px-3 py-2 text-left text-xl font-semibold transition-colors hover:bg-white/10 hover:text-emerald-100 ${
            active === "blog"
              ? "bg-emerald-300/15 text-emerald-100"
              : "text-emerald-200"
          }`}
        >
          Blog
        </Link>
      </nav>
    </>
  );
}
