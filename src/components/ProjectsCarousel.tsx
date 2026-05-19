"use client";

import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { projects } from "@/content/projects";
import ProjectCard from "./ProjectCard";

const STEP_MS = 4500; // auto-advance: one project per interval

export default function ProjectsCarousel() {
  const ref = useRef<HTMLDivElement | null>(null);
  const autoTimer = useRef<number | null>(null);
  // Lets the side buttons (defined outside the effect) restart the timer.
  const resetAuto = useRef<() => void>(() => {});
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const onScroll = () => {
      const max = el.scrollWidth - el.clientWidth;
      // setState bails when the boolean is unchanged, so this is cheap.
      setAtStart(el.scrollLeft <= 1);
      setAtEnd(el.scrollLeft >= max - 1);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Snap anchor: the scrollport's start edge inset by scroll-padding, i.e.
    // the content-column left edge a card's left edge should align to.
    const containerStart = () => {
      const cs = getComputedStyle(el);
      const pad =
        parseFloat(cs.scrollPaddingLeft) || parseFloat(cs.paddingLeft) || 0;
      return el.getBoundingClientRect().left + pad;
    };

    const nearestIndex = () => {
      const s = containerStart();
      let best = Infinity;
      let idx = 0;
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const d = Math.abs(kids[i].getBoundingClientRect().left - s);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      return idx;
    };

    const alignChild = (i: number, smooth: boolean) => {
      const kids = el.children;
      const j = Math.max(0, Math.min(kids.length - 1, i));
      const r = kids[j].getBoundingClientRect();
      el.scrollBy({
        left: r.left - containerStart(),
        behavior: smooth ? "smooth" : "auto",
      });
    };

    // Auto-advance: snap to the next project, looping back to the start. Any
    // interaction restarts the countdown via schedule() so it holds on the
    // landed card for a full interval.
    let down = false;
    const advance = () => {
      if (down) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = nearestIndex() + 1;
      if (next >= el.children.length || el.scrollLeft >= max - 1) {
        alignChild(0, true);
      } else {
        alignChild(next, true);
      }
    };
    const schedule = () => {
      if (autoTimer.current) window.clearTimeout(autoTimer.current);
      if (reduce) return;
      autoTimer.current = window.setTimeout(() => {
        advance();
        schedule();
      }, STEP_MS);
    };
    resetAuto.current = schedule;
    schedule();

    // Pointer drag-to-scroll. CSS mandatory snap is suspended during the
    // drag so direct scrollLeft writes aren't fought; a JS target (velocity-
    // and distance-aware) decides the destination pane on release.
    let startX = 0;
    let startLeft = 0;
    let startIdx = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let pointerId: number | null = null;
    const onDown = (e: PointerEvent) => {
      // Touch/pen use native pan-x scrolling + CSS mandatory snap (smooth
      // momentum, and iOS fires pointercancel not pointerup when it claims the
      // horizontal pan, which would otherwise strand `down`). JS drag is
      // mouse-only.
      if (e.pointerType !== "mouse") return;
      down = true;
      pointerId = e.pointerId;
      // Keep move/up flowing even when the cursor passes over a card's
      // Cloudflare Stream <iframe>, which would otherwise swallow them.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      if (autoTimer.current) window.clearTimeout(autoTimer.current);
      startX = e.clientX;
      startLeft = el.scrollLeft;
      startIdx = nearestIndex();
      lastX = e.clientX;
      lastT = performance.now();
      vx = 0;
      el.style.scrollSnapType = "none";
    };
    const releaseCapture = () => {
      if (pointerId === null) return;
      try {
        el.releasePointerCapture(pointerId);
      } catch {}
      pointerId = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const now = performance.now();
      const dt = now - lastT || 16;
      vx = (e.clientX - lastX) / dt; // px per ms
      lastX = e.clientX;
      lastT = now;
      el.scrollLeft = startLeft - (e.clientX - startX);
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      releaseCapture();
      const fc = el.firstElementChild as HTMLElement | null;
      const step = fc ? fc.offsetWidth + 20 : 320; // 20px = gap-5
      const moved = el.scrollLeft - startLeft;
      const flick = Math.abs(vx) > 0.3;
      let dir = 0;
      if (flick) dir = vx < 0 ? 1 : -1; // drag left -> advance forward
      else if (Math.abs(moved) > step * 0.2) dir = moved > 0 ? 1 : -1;

      let target: number;
      if (dir === 0) {
        target = nearestIndex();
      } else {
        const steps = Math.max(1, Math.round(Math.abs(moved) / step));
        target = startIdx + dir * steps;
      }
      alignChild(target, true);
      // Restore CSS mandatory snap once the smooth scroll lands; sooner would
      // let the browser fight the in-flight scrollBy. Skip if a new drag
      // started before we settled — its onDown re-applied snap=none and its
      // onUp will queue a fresh restorer. The timer is a fallback for browsers
      // without `scrollend` (older desktop Safari) so snap is never stranded.
      let restored = false;
      const restoreSnap = () => {
        if (restored || down) return;
        restored = true;
        el.removeEventListener("scrollend", restoreSnap);
        clearTimeout(snapTimer);
        el.style.scrollSnapType = "";
      };
      const snapTimer = setTimeout(restoreSnap, 700);
      el.addEventListener("scrollend", restoreSnap, { once: true });
      schedule(); // hold here for a full interval before auto-advancing
    };
    // iOS/native pan or any interrupted gesture: settle state so `down` and
    // the suspended snap never get stranded.
    const onCancel = () => {
      if (!down) return;
      down = false;
      releaseCapture();
      el.style.scrollSnapType = "";
      schedule();
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    // Native CSS mandatory snap handles wheel/touchpad scrolling. When any
    // scroll settles (wheel, button, auto-advance), reset the countdown so
    // the landed card gets a full interval. Skip while a drag is in flight —
    // its scrollLeft writes can fire scrollend mid-drag.
    const onScrollEnd = () => {
      if (down) return;
      schedule();
    };
    el.addEventListener("scrollend", onScrollEnd);

    return () => {
      if (autoTimer.current) window.clearTimeout(autoTimer.current);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("scrollend", onScrollEnd);
      el.style.scrollSnapType = "";
    };
  }, []);

  // Side buttons for anyone who can't scroll horizontally.
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 20 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
    resetAuto.current(); // restart the countdown from this card
  };

  const arrowClass =
    "frost ink absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-base transition-all duration-300 hover:bg-black/50";
  const hidden = "pointer-events-none opacity-0";

  return (
    <div className="relative">
      <button
        aria-label="Previous projects"
        aria-hidden={atStart}
        tabIndex={atStart ? -1 : 0}
        onClick={() => nudge(-1)}
        className={`${arrowClass} left-3 sm:left-6 ${atStart ? hidden : ""}`}
      >
        <FaChevronLeft />
      </button>
      <button
        aria-label="Next projects"
        aria-hidden={atEnd}
        tabIndex={atEnd ? -1 : 0}
        onClick={() => nudge(1)}
        className={`${arrowClass} right-3 sm:right-6 ${atEnd ? hidden : ""}`}
      >
        <FaChevronRight />
      </button>
      <div
        ref={ref}
        className="no-scrollbar flex touch-pan-x snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain"
        style={{
          cursor: "grab",
          // Bound the first/last card to the site's content column (max-w-3xl
          // = 48rem, + the 1.5rem heading gutter) so the strip lines up with
          // the section heading. scrollPaddingInline must match so the
          // `snap-start` line sits on the same content-column edge that JS
          // (containerStart) reads back. The scroller still spans full width,
          // so mid cards bleed to the borders and nothing is clipped.
          paddingInline: "max(1.5rem, calc((100vw - 48rem) / 2 + 1.5rem))",
          scrollPaddingInline:
            "max(1.5rem, calc((100vw - 48rem) / 2 + 1.5rem))",
        }}
      >
        {projects.map((project) => (
          <div
            key={project.name}
            // Cap height so the 3:4 width never exceeds ~80vw — keeps edge
            // space on narrow/mobile screens (width = height * 3/4).
            className="aspect-[3/4] h-[min(clamp(20rem,62vh,34rem),106vw)] shrink-0 snap-start select-none"
          >
            <ProjectCard project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}
