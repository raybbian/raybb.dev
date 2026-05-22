"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";

type Props = {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
  // When true, the side buttons wrap to the other end at the boundary
  // instead of being hidden.
  loop?: boolean;
};

export default function Carousel({
  children,
  prevLabel,
  nextLabel,
  loop = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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

    // Stretch the trailing padding so the last item can scroll-snap to the
    // left edge. Without this, max scrollLeft puts the last item at
    // (clientWidth - rightPad - lastWidth) from the viewport left, which is
    // greater than the snap line at leftPad — so it never snaps to start.
    const updateEndPadding = () => {
      const last = el.lastElementChild as HTMLElement | null;
      if (!last) return;
      const cs = getComputedStyle(el);
      const leftPad = parseFloat(cs.paddingLeft) || 0;
      const lastWidth = last.getBoundingClientRect().width;
      const needed = Math.max(0, el.clientWidth - leftPad - lastWidth);
      const next = `${needed}px`;
      if (el.style.paddingInlineEnd !== next) el.style.paddingInlineEnd = next;
    };
    updateEndPadding();
    const ro = new ResizeObserver(updateEndPadding);
    ro.observe(el);

    const onScroll = () => {
      const max = el.scrollWidth - el.clientWidth;
      setAtStart(el.scrollLeft <= 1);
      setAtEnd(el.scrollLeft >= max - 1);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Pointer drag-to-scroll. CSS mandatory snap is suspended during the
    // drag so direct scrollLeft writes aren't fought; a JS target (velocity-
    // and distance-aware) decides the destination pane on release.
    let down = false;
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
      // Keep move/up flowing even when the cursor passes over child iframes
      // (e.g. Cloudflare Stream) which would otherwise swallow them.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
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
    };
    const onCancel = () => {
      if (!down) return;
      down = false;
      releaseCapture();
      el.style.scrollSnapType = "";
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    // Block native drag-and-drop on descendant <a>/<img>: without this,
    // mouse-dragging a card initiates a link/image drag (browser shows the
    // URL ghost) instead of our scroll-drag.
    const onDragStart = (e: DragEvent) => e.preventDefault();
    el.addEventListener("dragstart", onDragStart);

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("dragstart", onDragStart);
      el.style.scrollSnapType = "";
      el.style.paddingInlineEnd = "";
    };
  }, []);

  // Side buttons. With `loop`, reaching either end wraps to the opposite end
  // (smooth-scrolled). Otherwise the boundary button is hidden via opacity.
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (loop) {
      if (dir === 1 && el.scrollLeft >= max - 1) {
        el.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }
      if (dir === -1 && el.scrollLeft <= 1) {
        el.scrollTo({ left: max, behavior: "smooth" });
        return;
      }
    }
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 20 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const arrowClass =
    "frost ink absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-base transition-all duration-300 hover:bg-black/50";
  const hidden = "pointer-events-none opacity-0";
  const hidePrev = !loop && atStart;
  const hideNext = !loop && atEnd;

  return (
    <div className="relative">
      <button
        aria-label={prevLabel}
        aria-hidden={hidePrev}
        tabIndex={hidePrev ? -1 : 0}
        onClick={() => nudge(-1)}
        className={`${arrowClass} left-3 sm:left-6 ${hidePrev ? hidden : ""}`}
      >
        <FaChevronLeft />
      </button>
      <button
        aria-label={nextLabel}
        aria-hidden={hideNext}
        tabIndex={hideNext ? -1 : 0}
        onClick={() => nudge(1)}
        className={`${arrowClass} right-3 sm:right-6 ${hideNext ? hidden : ""}`}
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
        {children}
      </div>
    </div>
  );
}
