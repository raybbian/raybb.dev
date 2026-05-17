"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Fish } from "@/sim/Fish";
import { FishRenderer } from "@/render/FishRenderer";
import { Lilypads, LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import { Lotuses } from "@/sim/Lotuses";
import { LotusRenderer } from "@/render/LotusRenderer";
import { WaterRenderer } from "@/render/WaterRenderer";
import { ShadowRenderer, fishHeight } from "@/render/ShadowRenderer";
import { Treats, type Treat } from "@/sim/Treats";
import { TreatRenderer } from "@/render/TreatRenderer";
import { Ripples } from "@/sim/Ripples";
import { mag, sub, mulberry32, type Vec2 } from "@/lib/math";
import { pickKoiColors } from "@/sim/koiPattern";
import { instrumentGl } from "@/lib/glPerf";

const FISH_COUNT = 9;
const FISH_SCALE_MEAN = 0.5; // vs the original single fish
const FISH_SCALE_VAR = 0.2; // +/- fraction around the mean
const SPAWN_INSET = 0.15;
const FISH_DEPTH_MIN = 0.18; // fixed submergence range, no bob
const FISH_DEPTH_MAX = 0.68;
const MAX_DPR = 2;
const DPR_FALLBACK = 1;
// Adaptive internal-resolution scale for the heavy offscreen passes (shadow,
// scene, water composite). The canvas and the crisp top layer stay full-res;
// only fill cost scales (~RENDER_SCALE^2). Re-tuned each second toward a 60fps
// budget, clamped so it never up-samples nor drops below half resolution.
const RENDER_SCALE_MIN = 0.5;
const RENDER_SCALE_MAX = 1;
const RENDER_SCALE_STEP = 0.1;
const FRAME_BUDGET_MS = 1000 / 60;
const ADAPT_INTERVAL_MS = 1000;
const DT_CLAMP_S = 0.1; // cap dt so a backgrounded tab doesn't teleport
// Pond is a tall virtual scene; only a viewport slice is drawn. Height is a
// fraction of page content, so it scrolls slower than the page.
const SCENE_FRACTION = 0.4;
const REF_WIDTH = 1440; // viewport width at which sizes are 1x
const SCREEN_SCALE_MIN = 0.6;
const SCREEN_SCALE_MAX = 1.4;
const RESIZE_DEBOUNCE_MS = 150;
// Frames the camera holds still after a route change so Next's post-nav
// scroll reset is absorbed whenever it lands (~200ms; imperceptible).
const NAV_SETTLE_FRAMES = 12;
const MOUSE_FAST_PXS = 650; // cursor px/s above which fish flee
const SCARE_DUR = 0.7; // s a poke keeps scaring fish from that spot

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export default function FishBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const perfRef = useRef<HTMLDivElement>(null);
  const [showPerf, setShowPerf] = useState(false);
  const pathname = usePathname();
  // Detect route changes during render, NOT in an effect: Next resets
  // window.scrollY around the navigation commit at a time that isn't ordered
  // relative to our rAF loop, so an effect-based flag races the loop and the
  // scene snaps non-deterministically. A ref diff in render is guaranteed set
  // before the next frame; the settle window (consumed in the loop) then
  // absorbs the scroll reset whenever it actually lands.
  const lastPathRef = useRef(pathname);
  const navSettleRef = useRef(0);
  if (lastPathRef.current !== pathname) {
    lastPathRef.current = pathname;
    navSettleRef.current = NAV_SETTLE_FRAMES;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Context MSAA antialiases the fish silhouette; the body pattern keeps its
    // own fwidth-based edge AA.
    // antialias:false: every visible layer renders to an offscreen MSAA
    // target or has its own fwidth/SDF edge AA, so a multisampled default
    // backbuffer (+ its implicit resolve) only wastes bandwidth.
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      console.error("WebGL2 is not available");
      return;
    }
    const glPerf = instrumentGl(gl);

    let width = window.innerWidth;
    let height = window.innerHeight;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const rng = mulberry32(seed);

    // Sizes normalize to viewport width so the school isn't huge on a phone
    // nor tiny on a 4k monitor.
    let screenScale = clamp(
      width / REF_WIDTH,
      SCREEN_SCALE_MIN,
      SCREEN_SCALE_MAX,
    );
    let sceneW = width;

    // One palette per fish, each baked into its own pattern texture.
    const palettes = Array.from({ length: FISH_COUNT }, () =>
      pickKoiColors(rng),
    );
    const renderer = new FishRenderer(gl);
    renderer.setPalettes(palettes);

    // Rebuilt on resize so the school rescales with the pond. Uses the stable
    // `palettes` (created once, kept in sync with the renderer) and the
    // current closure values of sceneW/height/screenScale. Fish spawn in the
    // initial visible window; edge avoidance keeps them on screen thereafter.
    const makeFishes = () =>
      palettes.map((p, i) => {
        const scale =
          FISH_SCALE_MEAN *
          (1 + (rng() * 2 - 1) * FISH_SCALE_VAR) *
          screenScale;
        const fish = new Fish(
          {
            x: sceneW * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
            y: height * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
          },
          { base: p.base, mid: p.mid, accent: p.accent, fin: p.fin },
          FISH_DEPTH_MIN + rng() * (FISH_DEPTH_MAX - FISH_DEPTH_MIN),
          scale,
          {
            cruiseSpeed: 3.5 + rng() * 2.5,
            turnRateMult: 0.45 + rng() * 0.3,
            noisePhaseHeading: rng() * 1000,
            noisePhaseSpeed: rng() * 1000,
            noisePhaseMouth: rng() * 1000,
            seed: (rng() * 2 ** 32) >>> 0,
          },
          screenScale,
        );
        return { fish, palette: i };
      });
    let fishes = makeFishes();
    // Reused across frames to keep the rAF loop allocation-free; rebuilt
    // alongside `fishes` on resize.
    const buildOrdered = () =>
      fishes.map((o) => ({
        fish: o.fish,
        palette: o.palette,
        geo: o.fish.buildGeometry(),
      }));
    let ordered = buildOrdered();
    const lilypads = new Lilypads(seed, sceneW, screenScale);
    const lpRenderer = new LilypadRenderer(gl);
    const lotuses = new Lotuses(seed, sceneW, screenScale);
    const lotusRenderer = new LotusRenderer(gl);
    const water = new WaterRenderer(gl);
    const shadow = new ShadowRenderer(gl);
    let treats = new Treats(screenScale);
    const treatRenderer = new TreatRenderer(gl);
    let ripples = new Ripples(screenScale);
    const mouse = { x: width / 2, y: height / 2 };
    const prevMouse = { x: width / 2, y: height / 2 };
    // Camera into the infinite pond (logical px). worldY is a PURE function
    // of window.scrollY (worldY = anchor + scrollY*P), so scrolling is exactly
    // reversible — no integrator drift, the same scroll position always shows
    // the same scene. `anchor` is rebased across navigation (during the settle
    // window) so the scene stays continuous when Next resets scrollY.
    let anchor = 0;
    let worldY = 0;

    let renderScale = RENDER_SCALE_MAX;
    let lastDpr = DPR_FALLBACK;
    // Scaled offscreen size the fish/shadow passes render into; their shadow
    // sampling divides gl_FragCoord by exactly this, so it must match the
    // viewport (NOT the full canvas).
    let fbW = 1;
    let fbH = 1;

    // (Re)allocates the scaled offscreen targets. Cheap to call every frame:
    // each renderer's resize() early-outs when its dims are unchanged.
    const resizeTargets = () => {
      fbW = Math.max(1, Math.floor(canvas.width * renderScale));
      fbH = Math.max(1, Math.floor(canvas.height * renderScale));
      water.resize(fbW, fbH);
      shadow.resize(fbW, fbH, lastDpr * renderScale);
    };

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || DPR_FALLBACK, MAX_DPR);
      lastDpr = dpr;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      resizeTargets();
    };
    sizeCanvas();

    // Per-frame: advance the camera by the scroll delta with a fixed,
    // page-independent parallax. On a route change Next resets scrollY; the
    // rebase flag makes us absorb that step instead of snapping. A
    // non-scrollable page just freezes worldY (no delta).
    const recomputeScroll = () => {
      const sy = window.scrollY;
      // Post-navigation settle: hold worldY at its pre-nav value and re-derive
      // the anchor against the (possibly resetting) scrollY, so Next's scroll
      // reset is absorbed whenever it lands and the pure mapping then resumes
      // seamlessly instead of snapping.
      if (navSettleRef.current > 0) {
        navSettleRef.current--;
        anchor = worldY - sy * SCENE_FRACTION;
        return;
      }
      worldY = Math.max(0, anchor + sy * SCENE_FRACTION);
    };

    // Debounced: realloc GL buffers and rebuild the scene (fish + decorations)
    // at the new screenScale so everything rescales with the viewport.
    const applyResize = () => {
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      // ResizeObserver fires on observe() and on scrollbar/content changes
      // too; only an actual viewport change warrants the realloc + reseed.
      if (nextW === width && nextH === height) return;
      width = nextW;
      height = nextH;
      sizeCanvas();
      screenScale = clamp(
        width / REF_WIDTH,
        SCREEN_SCALE_MIN,
        SCREEN_SCALE_MAX,
      );
      sceneW = width;
      fishes = makeFishes();
      ordered = buildOrdered();
      // Bands regenerate lazily at the new metrics (deterministic, so the same
      // metrics reproduce the same field).
      lilypads.reconfigure(sceneW, screenScale);
      lotuses.reconfigure(sceneW, screenScale);
      treats = new Treats(screenScale);
      ripples = new Ripples(screenScale);
    };

    // Scene-space spot a poke just disturbed; fish flee it while t > 0.
    const scare = { x: 0, y: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove);
    // Lift the drop point into scene space so it stays put as the page scrolls.
    // Poking a lilypad/lotus springs it and sends a ripple instead of feeding;
    // open water still drops a treat. Lotuses sit on top, so test them first.
    const onDown = (e: PointerEvent) => {
      const sx = e.clientX;
      const sy = e.clientY + worldY;
      const hit = lotuses.poke(sx, sy) ?? lilypads.poke(sx, sy);
      if (hit) {
        ripples.spawn(hit.x, hit.y, hit.r);
        scare.x = hit.x;
        scare.y = hit.y;
        scare.t = SCARE_DUR;
        return;
      }
      treats.spawn(sx, sy);
    };
    window.addEventListener("pointerdown", onDown);
    // Releasing the pointer lets any held pad/lotus spring back to size.
    const onUp = () => {
      lilypads.release();
      lotuses.release();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // DEBUG (revert: git reset --hard f5af434): 'd' toggles shadow viz.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "d") {
        const w = window as unknown as { __shadowDebug?: boolean };
        w.__shadowDebug = !w.__shadowDebug;
      }
      if (e.key === "p") setShowPerf((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyResize, RESIZE_DEBOUNCE_MS);
    };
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(document.documentElement);

    const eaten: Treat[] = [];
    const mouseSceneObj = { x: 0, y: 0 };

    let raf = 0;
    let last = performance.now();
    // Sampled over a window so the readout doesn't jitter.
    let fpsFrames = 0;
    let fpsLast = last;
    let cpuAccum = 0;
    // Adaptive-quality window: runs regardless of the perf overlay.
    let adaptFrames = 0;
    let adaptLast = last;
    const frame = (now: number) => {
      const cpuStart = performance.now();
      const dt = Math.min((now - last) / 1000, DT_CLAMP_S);
      last = now;
      fpsFrames++;
      adaptFrames++;
      // Steer renderScale toward the 60fps budget. Asymmetric dead band
      // (down past budget, up only with comfortable headroom) + a
      // re-quantize keeps it from oscillating between two steps.
      if (now - adaptLast >= ADAPT_INTERVAL_MS) {
        const avgMs = (now - adaptLast) / adaptFrames;
        let next = renderScale;
        if (avgMs > FRAME_BUDGET_MS * 1.05)
          next = renderScale - RENDER_SCALE_STEP;
        else if (avgMs < FRAME_BUDGET_MS * 0.8)
          next = renderScale + RENDER_SCALE_STEP;
        next =
          Math.round(
            clamp(next, RENDER_SCALE_MIN, RENDER_SCALE_MAX) /
              RENDER_SCALE_STEP,
          ) * RENDER_SCALE_STEP;
        if (next !== renderScale) {
          renderScale = next;
          resizeTargets();
        }
        adaptFrames = 0;
        adaptLast = now;
      }
      // Reads last frame's draw counts; beginFrame() below resets them.
      const fpsEl = perfRef.current;
      if (fpsEl && now - fpsLast >= 500) {
        const span = now - fpsLast;
        const fps = (fpsFrames * 1000) / span;
        const ms = span / fpsFrames;
        const cpu = cpuAccum / fpsFrames;
        const gpu =
          glPerf.gpuMs >= 0 ? `${glPerf.gpuMs.toFixed(1)} ms` : "n/a";
        const { calls, verts, tris } = glPerf.stats;
        fpsEl.textContent =
          `${fps.toFixed(0)} fps  ${ms.toFixed(1)} ms\n` +
          `cpu ${cpu.toFixed(1)} ms  gpu ${gpu}\n` +
          `${calls} draws  ${(verts / 1000).toFixed(1)}k v  ${(tris / 1000).toFixed(1)}k tri\n` +
          `${canvas.width}×${canvas.height} @${(canvas.width / width).toFixed(1)}x\n` +
          `rs ${renderScale.toFixed(2)} → ${fbW}×${fbH}\n` +
          glPerf.gpuInfo;
        fpsFrames = 0;
        cpuAccum = 0;
        fpsLast = now;
      }
      recomputeScroll();
      // Stream decoration bands around the (just-updated) camera window.
      lilypads.update(worldY, height);
      lotuses.update(worldY, height);
      // A still/slow pointer reads as null so Fish.resolve skips avoidance.
      const mv = dt > 0 ? mag(sub(mouse, prevMouse)) / dt : 0;
      prevMouse.x = mouse.x;
      prevMouse.y = mouse.y;
      // Lift cursor from client into scene space so fish dodge it when scrolled.
      let mouseScene: Vec2 | null = null;
      if (mv > MOUSE_FAST_PXS * screenScale) {
        mouseSceneObj.x = mouse.x;
        mouseSceneObj.y = mouse.y + worldY;
        mouseScene = mouseSceneObj;
      }
      // A fresh poke overrides the cursor flee: fish bolt from that spot.
      if (scare.t > 0) scare.t -= dt;
      const avoid: Vec2 | null = scare.t > 0 ? scare : mouseScene;
      treats.resolve(dt);
      ripples.resolve(dt);
      const treatList = treats.list();
      for (const { fish } of fishes)
        fish.resolve(dt, avoid, treatList, sceneW, height, worldY);
      eaten.length = 0;
      for (const { fish } of fishes) {
        if (fish.sated) continue;
        const s = fish.snout;
        for (const tr of treatList)
          if (!eaten.includes(tr) && mag(sub(s, tr)) < treats.eatRadius) {
            eaten.push(tr);
            fish.eat();
          }
      }
      for (const tr of eaten) treats.eat(tr);
      lilypads.resolve(dt);
      lotuses.resolve(dt);
      // Built once and reused for the shadow mask, ripple stream, and visible
      // passes (single source of truth per frame).
      const inst = lilypads.buildInstances();
      const lotusInst = lotuses.buildInstances();
      // Deepest-first paint order so shallow fish draw on top.
      ordered.sort((a, b) => b.fish.depth - a.fish.depth);
      for (const e of ordered) e.geo = e.fish.buildGeometry();

      // Must precede the frame's first GL call.
      glPerf.beginFrame();
      // Caster pass casts real silhouettes into the height mask. No MAX-blend,
      // so order strictly bottom-to-top (deepest fish .. lotuses): the topmost
      // caster over a texel overwrites, so its MSAA edge composites cleanly
      // with no overlap outline.
      shadow.begin();
      for (const { fish, geo } of ordered) {
        renderer.cast(geo, width, height, fishHeight(fish.depth), worldY);
      }
      lpRenderer.cast(inst.data, inst.count, width, height, worldY);
      lotusRenderer.cast(
        lotusInst.data,
        lotusInst.count,
        width,
        height,
        worldY,
      );
      shadow.end();
      // Fish render into the scaled scene FBO; their shadow lookup divides
      // gl_FragCoord by this, so it's the scaled size, not the canvas.
      renderer.prepareShadow(shadow.tex, fbW, fbH);
      // Lilypads are NOT captured here — they float on the surface and draw
      // on top of the water pass, so no ripple/refraction touches them.
      water.beginScene();
      for (const { fish, geo, palette } of ordered) {
        renderer.draw(geo, width, height, fish.depth, palette, worldY);
      }

      // Treats sink, so render into the scene MRT before the water pass —
      // depth tint + refraction wash over them as they descend.
      const tInst = treats.renderInstances();
      treatRenderer.draw(tInst.data, tInst.count, width, height, worldY);

      // Water pass runs in screen space against the already-scrolled scene,
      // so each source's cy is shifted by -worldY. Pads/lotuses keep their
      // static rim (foam=true) at amp 1; click rings and treat splashes are
      // travelling-only (foam=false) with decaying amp. With band streaming
      // the active set spans off-screen margin bands too, so foam emission is
      // clipped to the visible band to keep the ripple count viewport-bounded.
      // Lotuses are emitted before the (more numerous) pad rims so blooms
      // never starve the cap; click rings precede treats so a poke never does.
      water.beginRipples();
      lotuses.emitRipples(water, worldY, height);
      const instFloats = inst.count * LILYPAD_INST_FLOATS;
      for (let b = 0; b < instFloats; b += LILYPAD_INST_FLOATS) {
        const cy = inst.data[b + 1] - worldY;
        const r = inst.data[b + 2];
        if (cy + r < 0 || cy - r > height) continue; // off-screen rim
        water.addRipple(
          inst.data[b],
          cy,
          r,
          inst.data[b + 3],
          inst.data[b + 4],
          1,
          true,
          inst.data[b + 5], // pad's deterministic seed (stable per pad)
        );
      }
      ripples.emitRipples(water, worldY);
      treats.emitRipples(water, worldY);
      water.composite(width, height, now / 1000, shadow.tex, screenScale);
      // Upscale the scaled composite to the full-res default framebuffer;
      // lilypads/lotuses then draw crisp on top at native resolution.
      water.present(canvas.width, canvas.height);
      lpRenderer.draw(
        inst.data,
        inst.count,
        width,
        height,
        worldY,
        shadow.tex,
        canvas.width,
        canvas.height,
      );
      lotusRenderer.draw(
        lotusInst.data,
        lotusInst.count,
        width,
        height,
        worldY,
      );
      glPerf.endFrame();
      cpuAccum += performance.now() - cpuStart;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      renderer.dispose();
      lpRenderer.dispose();
      lotusRenderer.dispose();
      treatRenderer.dispose();
      water.dispose();
      shadow.dispose();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      />
      {showPerf && (
        <div
          ref={perfRef}
          className="pointer-events-none fixed left-3 top-3 z-50 max-w-[80vw] whitespace-pre-wrap rounded bg-black/55 px-2.5 py-1.5 font-mono text-xs leading-tight text-emerald-200 tabular-nums"
        >
          measuring…
        </div>
      )}
    </>
  );
}
