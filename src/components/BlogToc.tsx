"use client";

import { useEffect, useRef, useState } from "react";
import { FaListUl } from "react-icons/fa6";
import type { TocEntry } from "./TocProvider";

type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
  children: TocItem[];
};

// Dedup by id (StrictMode renders bodies twice, so TocRegister pushes
// twice per heading), then group H3s under their preceding H2.
function buildTree(entries: TocEntry[]): TocItem[] {
  const seen = new Map<string, TocEntry>();
  for (const e of entries) if (!seen.has(e.id)) seen.set(e.id, e);
  const out: TocItem[] = [];
  let parent: TocItem | null = null;
  for (const e of seen.values()) {
    const item: TocItem = { ...e, children: [] };
    if (e.level === 2) {
      out.push(item);
      parent = item;
    } else if (parent) {
      parent.children.push(item);
    } else {
      // Orphan H3 (no preceding H2): treat as top-level.
      out.push(item);
    }
  }
  return out;
}

// Smooth scroll that survives iOS Safari's scroll-snap snap-back, mirrored
// from NavDrawer.tsx. We're not strictly inside a snap container, but the
// html element has y-mandatory snap on lg+, so play it safe.
function smoothScrollTo(
  id: string,
  snapRestoreRef: { current: (() => void) | null },
) {
  const el = document.getElementById(id);
  if (!el) return;
  snapRestoreRef.current?.();
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("scroll-snap-type", "none");
  let done = false;
  const restore = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", restore);
    clearTimeout(timer);
    rootStyle.removeProperty("scroll-snap-type");
    snapRestoreRef.current = null;
  };
  const timer = setTimeout(restore, 700);
  window.addEventListener("scrollend", restore, { once: true });
  snapRestoreRef.current = restore;
  el.scrollIntoView({ behavior: "smooth" });
  if (window.location.hash !== `#${id}`) {
    history.replaceState(null, "", `#${id}`);
  }
}

export default function BlogToc({ entries }: { entries: TocEntry[] }) {
  const items = buildTree(entries);
  // Content-derived key for effect deps: `entries` identity flips every
  // TocProvider render even when the headings haven't actually changed.
  const itemsKey = items
    .flatMap((i) => [
      `${i.level}:${i.id}`,
      ...i.children.map((c) => `3:${c.id}`),
    ])
    .join("|");
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);
  const snapRestoreRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const flat: string[] = [];
    for (const i of items) {
      flat.push(i.id);
      for (const c of i.children) flat.push(c.id);
    }
    if (flat.length === 0) return;
    const ids = new Set(flat);
    const elements = flat
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    const order = new Map<string, number>();
    elements.forEach((el, i) => order.set(el.id, i));
    const visible = new Set<string>();
    // Closure-local guard: avoids redundant work without making setActive's
    // updater impure. Calling history.replaceState inside a setState
    // updater would dispatch into Next.js's patched Router during BlogToc's
    // render and trip a "setState in render" warning.
    let lastBest = "";

    const pickActive = () => {
      let bestId = "";
      let bestIdx = Infinity;
      visible.forEach((id) => {
        const idx = order.get(id);
        if (idx !== undefined && idx < bestIdx) {
          bestIdx = idx;
          bestId = id;
        }
      });
      if (!bestId || bestId === lastBest) return;
      lastBest = bestId;
      setActive(bestId);
      if (window.location.hash !== `#${bestId}`) {
        history.replaceState(null, "", `#${bestId}`);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        pickActive();
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    elements.forEach((el) => io.observe(el));

    // Seed from current hash if present. Can't be a lazy useState init —
    // window isn't defined at SSR and the value would mismatch on hydration.
    const initial = window.location.hash.replace("#", "");
    if (initial && ids.has(initial)) {
      lastBest = initial;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(initial);
    }

    return () => io.disconnect();
    // itemsKey captures heading-set changes; `items` is intentionally
    // omitted because its identity flips every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const ref = snapRestoreRef;
    return () => {
      window.removeEventListener("keydown", onKey);
      ref.current?.();
    };
  }, []);

  if (items.length === 0) return null;

  const onClickItem = (id: string) => {
    setOpen(false);
    smoothScrollTo(id, snapRestoreRef);
  };

  // The h2 whose own id, or one of whose h3 children's ids, is the active
  // heading. Only that section's h3 list is revealed; the rest collapse.
  const currentH2Id = (() => {
    if (!active) return "";
    for (const item of items) {
      if (item.id === active) return item.id;
      if (item.children.some((c) => c.id === active)) return item.id;
    }
    return "";
  })();

  const renderList = (extraClass = "") => (
    <ul className={`flex flex-col gap-0.5 ${extraClass}`}>
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onClickItem(item.id)}
            aria-current={active === item.id ? "true" : undefined}
            className={`block w-full truncate rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/5 ${
              active === item.id ? "ink bg-white/10" : "ink-2"
            }`}
          >
            {item.text}
          </button>
          {item.children.length > 0 && (
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                currentH2Id === item.id
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]"
              }`}
            >
              <ul className="flex flex-col gap-0.5 overflow-hidden pt-0.5">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <button
                      onClick={() => onClickItem(child.id)}
                      aria-current={active === child.id ? "true" : undefined}
                      className={`block w-full truncate rounded-md py-1 pl-6 pr-3 text-left text-xs transition-colors hover:bg-white/5 ${
                        active === child.id ? "ink bg-white/10" : "ink-3"
                      }`}
                    >
                      {child.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Desktop: top edge at 33% down, just left of the content container.
         50% - 24rem (half content) - 1rem (gap) - 14rem (own width) = 50% - 39rem.
         Clamped so it stays on-screen at the lg breakpoint where the content
         column doesn't yet leave full room for it. */}
      <aside
        aria-label="Table of contents"
        style={{ left: "max(1.25rem, calc(50% - 39rem))" }}
        className="frost no-scrollbar fixed top-1/4 z-30 hidden max-h-[calc(67vh-2rem)] w-56 overflow-y-auto rounded-2xl p-3 shadow-lg shadow-black/30 lg:block"
      >
        <p className="ink-3 mb-2 px-3 text-xs font-semibold uppercase tracking-wider">
          On this page
        </p>
        {renderList()}
      </aside>

      {/* Mobile: floating toggle */}
      <button
        type="button"
        aria-label={open ? "Close table of contents" : "Open table of contents"}
        onClick={() => setOpen((v) => !v)}
        className="frost ink fixed bottom-5 left-5 z-50 grid h-12 w-12 place-items-center rounded-full shadow-lg shadow-black/30 transition-colors hover:bg-black/50 lg:hidden"
      >
        <FaListUl className="text-base" />
      </button>

      {/* Mobile: backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Mobile: left drawer */}
      <nav
        aria-label="Table of contents"
        className={`frost-strong fixed left-0 top-0 z-40 flex h-full w-72 max-w-[80vw] flex-col border-y-0 border-l-0 px-5 pt-20 transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="ink-3 mb-3 px-3 text-xs font-semibold uppercase tracking-wider">
          On this page
        </p>
        <div className="no-scrollbar overflow-y-auto pb-8">{renderList()}</div>
      </nav>
    </>
  );
}
