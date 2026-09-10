"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaCheck, FaRegCopy, FaSpinner, FaXmark } from "react-icons/fa6";
import { useInView } from "@/lib/useInView";
import { useTheme } from "@/lib/useTheme";
import { useFigureRegistry } from "@/figures/registryContext";
import { worldScale, viewUnits } from "@/lib/worldScale";
import type { FigureView, Sketch, SketchHost } from "@/figures/types";

// How a figure's intrinsic aspect maps into the container box:
//  - "fit":     letterbox, never distorted (default — a fish looks like a fish)
//  - "cover":   fill the box, cropping overflow, never distorted
//  - "stretch": fill the box exactly, distorting if aspects differ
export type FigureFit = "fit" | "cover" | "stretch";

// Centered, lazily-initialized, interactive figure. Each post owns a figure
// registry at src/content/blog/<slug>/figures/registry.ts (shared infra —
// types/palette/mesh — lives in src/figures/*) and provides it via context
// from its FiguresProvider; the matching sketch's drawing code (2D or WebGL2)
// is then dynamically imported only once this figure scrolls near the
// viewport, and its animation loop pauses when it scrolls away. SSR-safe:
// nothing touches a canvas until an effect runs.
export function Figure({
  id,
  caption,
  aspect = 16 / 9,
  fit = "fit",
}: {
  id: string;
  caption?: ReactNode;
  aspect?: number;
  fit?: FigureFit;
}) {
  const { ref: rootRef, inView } = useInView<HTMLDivElement>("300px 0px");
  const theme = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const figures = useFigureRegistry();

  // Sticky activation, computed during render (not in an effect): once near
  // the viewport we keep the sketch alive and only pause/resume its loop.
  const [activated, setActivated] = useState(false);
  if (inView && !activated) setActivated(true);

  const sketchRef = useRef<Sketch | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctrlRef = useRef<{
    start: () => void;
    stop: () => void;
    redraw: () => void;
  } | null>(null);
  const inViewRef = useRef(inView);
  const [failed, setFailed] = useState(false);
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const copyResetTimeoutRef = useRef<number | null>(null);
  const spinnerDelayRef = useRef<number | null>(null);

  useEffect(() => {
    inViewRef.current = inView;
  }, [inView]);

  // Build canvas + sketch + observers once activated.
  useEffect(() => {
    if (!activated) return;
    const box = boxRef.current;
    if (!box) return;

    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      let mod;
      try {
        mod = (await figures[id]()).default;
      } catch (e) {
        console.error(`Figure "${id}" failed to load`, e);
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !boxRef.current) return;

      const canvas = document.createElement("canvas");
      canvas.style.cssText =
        "width:100%;height:100%;display:block;touch-action:none";
      box.appendChild(canvas);
      canvasRef.current = canvas;

      let host: SketchHost;
      if (mod.kind === "2d") {
        const ctx = canvas.getContext("2d");
        if (!ctx) return setFailed(true);
        host = { kind: "2d", canvas, ctx };
      } else {
        const gl = canvas.getContext("webgl2", {
          antialias: true,
          // Straight (non-premultiplied) alpha so the translucent themed
          // clear color composites over the page correctly.
          premultipliedAlpha: false,
          // Keep the backing buffer readable so the "Copy PNG" button can
          // call canvas.toBlob() at any time without capturing a blank frame.
          preserveDrawingBuffer: true,
        });
        if (!gl) return setFailed(true);
        host = { kind: "webgl2", canvas, gl };
      }

      // Read theme straight from the DOM (set by /theme-bootstrap.js before
      // paint). useTheme's useSyncExternalStore returns the server snapshot
      // ("light") during hydration; if IntersectionObserver activates this
      // figure before React reconciles to the real value, the captured
      // `theme` would be wrong and the sketch would mount in light then fade
      // into dark on the first frame.
      const initialTheme =
        document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const sketch = mod.create(host, initialTheme);
      sketchRef.current = sketch;

      // Placement of the intrinsic-aspect drawing area inside the box, plus
      // the world-unit view hand to the sketch. `units` is constant for a
      // given figure (REF_WIDTH wide); only `scale` moves as the box resizes.
      const view = { ox: 0, oy: 0, dw: 0, dh: 0, dpr: 1 };
      const units = viewUnits(mod.aspect);
      const sketchView: FigureView = {
        w: units.w,
        h: units.h,
        scale: 1,
        dpr: 1,
      };
      const place = () => {
        const cw = box.clientWidth;
        const ch = box.clientHeight;
        const a = mod.aspect;
        let dw: number, dh: number;
        if (fit === "stretch") {
          dw = cw;
          dh = ch;
        } else if (fit === "cover") {
          dw = Math.max(cw, ch * a);
          dh = dw / a;
        } else {
          dw = Math.min(cw, ch * a);
          dh = dw / a;
        }
        view.ox = (cw - dw) / 2;
        view.oy = (ch - dh) / 2;
        view.dw = dw;
        view.dh = dh;
        view.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cw * view.dpr);
        canvas.height = Math.round(ch * view.dpr);
        // One world unit spans `dw / REF_WIDTH` CSS px. Baking that into the
        // 2D transform is what lets sketches draw in units directly; the GL
        // path gets the same effect by taking `u_res` in units.
        sketchView.scale = worldScale(view.dw);
        sketchView.dpr = view.dpr;
        if (host.kind === "2d") {
          const k = sketchView.scale * view.dpr;
          host.ctx.setTransform(
            k,
            0,
            0,
            k,
            view.ox * view.dpr,
            view.oy * view.dpr,
          );
        } else {
          host.gl.viewport(
            Math.round(view.ox * view.dpr),
            Math.round((ch - view.dh - view.oy) * view.dpr),
            Math.round(view.dw * view.dpr),
            Math.round(view.dh * view.dpr),
          );
        }
      };

      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const looped = sketch.animated !== false && !reduced;

      let raf = 0;
      let last = 0;
      let running = false;
      const tick = (ts: number) => {
        const t = ts / 1000;
        const dt = last ? Math.min(0.1, t - last) : 0;
        last = t;
        sketch.frame(t, dt);
        raf = requestAnimationFrame(tick);
      };
      const redraw = () => sketch.frame(performance.now() / 1000, 0);
      const start = () => {
        if (running || !looped) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(tick);
      };
      const stop = () => {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
      ctrlRef.current = { start, stop, redraw };

      const applySize = () => {
        if (box.clientWidth === 0 || box.clientHeight === 0) return;
        place();
        sketch.resize(sketchView);
        if (!running) redraw();
      };
      const ro = new ResizeObserver(applySize);
      ro.observe(box);
      applySize();

      let down = false;
      // World units, so hit-testing compares against the same numbers the
      // sketch drew with.
      const toLocal = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left - view.ox) / sketchView.scale,
          y: (e.clientY - r.top - view.oy) / sketchView.scale,
        };
      };
      const onDown = (e: PointerEvent) => {
        down = true;
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        sketch.pointer?.({ type: "down", x, y, down });
        if (!running) redraw();
      };
      const onMove = (e: PointerEvent) => {
        const { x, y } = toLocal(e);
        sketch.pointer?.({ type: "move", x, y, down });
        if (!running && down) redraw();
      };
      const onUp = (e: PointerEvent) => {
        down = false;
        const { x, y } = toLocal(e);
        sketch.pointer?.({ type: "up", x, y, down });
        if (!running) redraw();
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      if (inViewRef.current) start();

      cleanup = () => {
        stop();
        ro.disconnect();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        sketch.dispose();
        canvas.remove();
        sketchRef.current = null;
        canvasRef.current = null;
        ctrlRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [activated, id, fit, figures]);

  // Pause/resume as the figure scrolls in and out of view.
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (inView) c.start();
    else c.stop();
  }, [inView]);

  // Live theme updates (background only — see figure palettes).
  useEffect(() => {
    const s = sketchRef.current;
    if (!s) return;
    s.setTheme(theme);
    ctrlRef.current?.redraw();
  }, [theme]);

  // Clear any pending copy-feedback timeouts if the figure unmounts mid-flash.
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
      if (spinnerDelayRef.current !== null) {
        window.clearTimeout(spinnerDelayRef.current);
        spinnerDelayRef.current = null;
      }
    };
  }, []);

  const finishCopyState = (next: "copied" | "error") => {
    if (spinnerDelayRef.current !== null) {
      window.clearTimeout(spinnerDelayRef.current);
      spinnerDelayRef.current = null;
    }
    setCopyState(next);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimeoutRef.current = null;
    }, 1500);
  };

  const handleCopy = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Make sure the very latest frame (current theme, current pointer state)
    // is in the backing buffer before we snapshot it. For paused/static
    // figures this is the only thing keeping the capture fresh.
    ctrlRef.current?.redraw();
    // Defer the spinner so quick captures go straight idle → check; only
    // large/slow figures trip the 150ms delay and reveal the spinner.
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
    if (spinnerDelayRef.current !== null) {
      window.clearTimeout(spinnerDelayRef.current);
    }
    spinnerDelayRef.current = window.setTimeout(() => {
      setCopyState("copying");
      spinnerDelayRef.current = null;
    }, 150);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        finishCopyState("error");
        return;
      }
      const supportsClipboardImage =
        typeof navigator !== "undefined" &&
        !!navigator.clipboard?.write &&
        typeof window !== "undefined" &&
        typeof window.ClipboardItem !== "undefined";
      if (supportsClipboardImage) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          finishCopyState("copied");
          return;
        } catch {
          // fall through to download
        }
      }
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `figure-${id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        finishCopyState("copied");
      } catch {
        finishCopyState("error");
      }
    }, "image/png");
  };

  const copyAriaLabel =
    copyState === "copied"
      ? "Copied figure as PNG"
      : copyState === "error"
        ? "Failed to copy figure"
        : copyState === "copying"
          ? "Copying figure"
          : "Copy figure as PNG";

  return (
    <figure ref={rootRef} className="my-8">
      <div
        ref={boxRef}
        style={{ aspectRatio: String(aspect) }}
        className="group relative w-full overflow-hidden rounded-xl border border-white/15 bg-black/20 shadow-lg shadow-black/10"
      >
        {failed && (
          <div className="ink-3 absolute inset-0 grid place-items-center text-sm">
            Couldn’t load this figure.
          </div>
        )}
        {!failed && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copyAriaLabel}
            aria-live="polite"
            className="frost ink-2 absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full opacity-0 transition-opacity duration-150 hover:bg-black/50 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60"
          >
            <span className="relative grid h-4 w-4 place-items-center">
              <FaRegCopy
                aria-hidden
                className={`col-start-1 row-start-1 transition duration-200 ease-out ${
                  copyState === "idle"
                    ? "scale-100 opacity-100"
                    : "scale-50 opacity-0"
                }`}
              />
              <FaSpinner
                aria-hidden
                className={`col-start-1 row-start-1 animate-spin transition duration-200 ease-out ${
                  copyState === "copying"
                    ? "scale-100 opacity-100"
                    : "scale-50 opacity-0"
                }`}
              />
              <FaCheck
                aria-hidden
                className={`col-start-1 row-start-1 text-emerald-400 transition duration-200 ease-out ${
                  copyState === "copied"
                    ? "scale-100 opacity-100"
                    : "scale-50 opacity-0"
                }`}
              />
              <FaXmark
                aria-hidden
                className={`col-start-1 row-start-1 text-red-400 transition duration-200 ease-out ${
                  copyState === "error"
                    ? "scale-100 opacity-100"
                    : "scale-50 opacity-0"
                }`}
              />
            </span>
          </button>
        )}
      </div>
      {caption && (
        <figcaption className="ink-3 mt-2 text-center text-sm">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
