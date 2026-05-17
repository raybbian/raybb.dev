"use client";

import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { projects } from "@/content/projects";
import ProjectCard from "./ProjectCard";

export default function ProjectsCarousel() {
  const ref = useRef<HTMLDivElement | null>(null);
  const paused = useRef(false);
  const resumeTimer = useRef<number | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    const tick = () => {
      const max = el.scrollWidth - el.clientWidth;
      // Gentle drift; stops at the end (no looping).
      if (!paused.current && !reduce && el.scrollLeft < max - 1) {
        el.scrollLeft += 0.4;
      }
      // setState bails when the boolean is unchanged, so this is cheap.
      setAtStart(el.scrollLeft <= 1);
      setAtEnd(el.scrollLeft >= max - 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const pause = () => {
      paused.current = true;
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    };
    const resumeSoon = () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
      resumeTimer.current = window.setTimeout(() => {
        paused.current = false;
      }, 1500);
    };

    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resumeSoon);
    el.addEventListener("pointerdown", pause);
    el.addEventListener("pointerup", resumeSoon);

    const containerCenter = () =>
      el.getBoundingClientRect().left + el.clientWidth / 2;

    const nearestIndex = () => {
      const c = containerCenter();
      let best = Infinity;
      let idx = 0;
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - c);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      return idx;
    };

    const centerChild = (i: number, smooth: boolean) => {
      const kids = el.children;
      const j = Math.max(0, Math.min(kids.length - 1, i));
      const r = kids[j].getBoundingClientRect();
      el.scrollBy({
        left: r.left + r.width / 2 - containerCenter(),
        behavior: smooth ? "smooth" : "auto",
      });
    };

    // Pointer drag-to-scroll. Snap is disabled for the whole gesture *and* the
    // release animation so CSS proximity-snap can't yank the strip back; a JS
    // target (velocity- and distance-aware) decides the destination pane.
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let startIdx = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    const onDown = (e: PointerEvent) => {
      down = true;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      startIdx = nearestIndex();
      lastX = e.clientX;
      lastT = performance.now();
      vx = 0;
      el.style.scrollSnapType = "none";
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
      centerChild(target, true);

      // Restore CSS snap only once the settle animation has finished.
      // scrollend where supported, with a timeout fallback; runs once.
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        el.style.scrollSnapType = "";
        el.removeEventListener("scrollend", restore);
      };
      el.addEventListener("scrollend", restore);
      window.setTimeout(restore, 500);
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resumeSoon);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("pointerup", resumeSoon);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Side buttons for anyone who can't scroll horizontally.
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    paused.current = true;
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      paused.current = false;
    }, 1500);
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 20 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const arrowClass =
    "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-white/10 text-base text-white backdrop-blur-md transition-all duration-300 hover:bg-white/20";
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
        className="no-scrollbar flex touch-pan-x snap-x snap-proximity gap-5 overflow-x-auto overscroll-x-contain px-6"
        style={{ cursor: "grab" }}
      >
        {projects.map((project) => (
          <div
            key={project.name}
            // Cap height so the 3:4 width never exceeds ~80vw — keeps edge
            // space on narrow/mobile screens (width = height * 3/4).
            className="aspect-[3/4] h-[min(clamp(20rem,62vh,34rem),106vw)] shrink-0 snap-center select-none"
          >
            <ProjectCard project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}
