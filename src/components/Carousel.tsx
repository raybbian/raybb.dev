"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";

// When looping, render the originals plus this many duplicate copies of the
// full set on EACH side. The user starts centered in the middle (original)
// copy; after any scroll settles, if they've drifted out of the middle copy
// we silently set scrollLeft to the equivalent position inside it. The dup
// content makes the teleport invisible.
const DUPS_PER_SIDE = 2;

type Props = {
  children: ReactNode;
  prevLabel: string;
  nextLabel: string;
  // When true, the carousel scrolls endlessly via cloned items + teleport.
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

  const childArr = Children.toArray(children).filter(isValidElement) as ReactElement[];
  const N = childArr.length;
  const copies = loop && N > 0 ? 1 + 2 * DUPS_PER_SIDE : 1;

  const rendered: ReactNode =
    copies === 1
      ? children
      : Array.from({ length: copies }).flatMap((_, c) =>
          childArr.map((child, i) =>
            cloneElement(child, {
              key: `c${c}-${child.key ?? i}`,
              // Dup copies are not focus/AT targets — only the middle copy is.
              ...(c !== DUPS_PER_SIDE
                ? { "aria-hidden": true, inert: true }
                : {}),
            }),
          ),
        );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // --- Loop measurements ---------------------------------------------------
    // middleStartLeft: scrollLeft that aligns the middle copy's first child
    //   to the snap line.
    // setWidth: distance (in scrollLeft units) between consecutive copies'
    //   first children — i.e. the width of one full set of cards + the gap
    //   that separates it from the next set.
    let middleStartLeft = 0;
    let setWidth = 0;
    const measure = () => {
      if (!loop || N === 0) return;
      const kids = el.children;
      if (kids.length < (DUPS_PER_SIDE + 1) * N + 1) return;
      const cs = getComputedStyle(el);
      const padLeft =
        parseFloat(cs.scrollPaddingLeft) || parseFloat(cs.paddingLeft) || 0;
      // getBoundingClientRect-based, so we don't depend on offsetParent — the
      // scroll container has no explicit position, so offsetLeft could be
      // resolved against an arbitrary ancestor.
      const containerLeft = el.getBoundingClientRect().left;
      const sl = el.scrollLeft;
      const middleFirst = kids[DUPS_PER_SIDE * N] as HTMLElement;
      const nextSetFirst = kids[(DUPS_PER_SIDE + 1) * N] as HTMLElement;
      const middlePos =
        middleFirst.getBoundingClientRect().left - containerLeft + sl;
      const nextPos =
        nextSetFirst.getBoundingClientRect().left - containerLeft + sl;
      middleStartLeft = middlePos - padLeft;
      setWidth = nextPos - middlePos;
    };

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

    measure();
    // Silently center the user in the middle (original) copy.
    if (loop && setWidth > 0) el.scrollLeft = middleStartLeft;

    const onScroll = () => {
      if (loop) {
        // Looping never "ends" — keep both arrows visible.
        setAtStart(false);
        setAtEnd(false);
        return;
      }
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

    // --- Teleport: after scroll settles, snap silently back into the middle
    // copy if we've drifted off it. The duplicated content makes the jump
    // invisible. Programmatic scrollLeft writes can re-fire scrollend, so a
    // `teleporting` flag prevents recursion.
    let teleporting = false;
    let idleTimer: number | null = null;
    const maybeTeleport = () => {
      if (!loop || teleporting || down || setWidth <= 0) return;
      const delta = el.scrollLeft - middleStartLeft;
      if (delta >= 0 && delta < setWidth) return;
      const wrapped = ((delta % setWidth) + setWidth) % setWidth;
      teleporting = true;
      el.scrollLeft = middleStartLeft + wrapped;
      requestAnimationFrame(() => {
        teleporting = false;
      });
    };
    const onScrollEnd = () => maybeTeleport();
    // Fallback for browsers without scrollend (older desktop Safari): debounce
    // the scroll event and treat 180ms of quiet as "settled".
    const onScrollIdle = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(maybeTeleport, 180);
    };
    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("scroll", onScrollIdle, { passive: true });

    // Re-measure + re-anchor on container resize.
    const ro = new ResizeObserver(() => {
      if (!loop) return;
      const prevDelta = el.scrollLeft - middleStartLeft;
      measure();
      if (setWidth > 0) {
        const wrapped = ((prevDelta % setWidth) + setWidth) % setWidth;
        teleporting = true;
        el.scrollLeft = middleStartLeft + wrapped;
        requestAnimationFrame(() => {
          teleporting = false;
        });
      }
    });
    ro.observe(el);

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scroll", onScrollIdle);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      ro.disconnect();
      el.style.scrollSnapType = "";
    };
  }, [loop, N]);

  // Side buttons for anyone who can't scroll horizontally. With `loop`, the
  // teleport effect wraps around behind the scenes; nudge just scrollBys.
  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
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
        {rendered}
      </div>
    </div>
  );
}
