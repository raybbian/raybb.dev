"use client";

import { useEffect, useRef } from "react";
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
import { mag, sub, type Vec2 } from "@/lib/math";
import { mulberry32, pickKoiColors } from "@/sim/koiPattern";

const FISH_COUNT = 9;
const FISH_SCALE_MEAN = 0.5; // vs the original single fish
const FISH_SCALE_VAR = 0.2; // +/- fraction around the mean
const SPAWN_INSET = 0.15;
const FISH_DEPTH_MIN = 0.18; // fixed submergence range, no bob
const FISH_DEPTH_MAX = 0.68;
const LILYPAD_COUNT = 18;
const LOTUS_COUNT = 9;
const MAX_DPR = 2;
const DPR_FALLBACK = 1;
const DT_CLAMP_S = 0.1; // cap dt so a backgrounded tab doesn't teleport
// Pond is a tall virtual scene; only a viewport slice is drawn. Height is a
// fraction of page content, so it scrolls slower than the page.
const SCENE_FRACTION = 0.4;
const REF_WIDTH = 1440; // viewport width at which sizes are 1x
const SCREEN_SCALE_MIN = 0.6;
const SCREEN_SCALE_MAX = 1.4;
const RESIZE_DEBOUNCE_MS = 150;
const MOUSE_FAST_PXS = 650; // cursor px/s above which fish flee
const SCARE_DUR = 0.7; // s a poke keeps scaring fish from that spot

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export default function FishBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Context MSAA antialiases the fish silhouette; the body pattern keeps its
    // own fwidth-based edge AA.
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
      console.error("WebGL2 is not available");
      return;
    }

    let width = window.innerWidth;
    let height = window.innerHeight;
    const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);

    const docScrollHeight = () => document.documentElement.scrollHeight;
    // Sizes normalize to viewport width so the school isn't huge on a phone
    // nor tiny on a 4k monitor.
    let screenScale = clamp(
      width / REF_WIDTH,
      SCREEN_SCALE_MIN,
      SCREEN_SCALE_MAX,
    );
    let sceneW = width;
    let sceneH = Math.max(height, docScrollHeight() * SCENE_FRACTION);

    // One palette per fish, each baked into its own pattern texture.
    const palettes = Array.from({ length: FISH_COUNT }, () =>
      pickKoiColors(rng),
    );
    const renderer = new FishRenderer(gl);
    renderer.setPalettes(palettes);

    // Rebuilt on resize so the school rescales with the pond. Uses the stable
    // `palettes` (created once, kept in sync with the renderer) and the
    // current closure values of sceneW/sceneH/screenScale.
    const makeFishes = () =>
      palettes.map((p, i) => {
        const scale =
          FISH_SCALE_MEAN *
          (1 + (rng() * 2 - 1) * FISH_SCALE_VAR) *
          screenScale;
        const fish = new Fish(
          {
            x: sceneW * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
            y: sceneH * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
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
    let lilypads = new Lilypads(
      rng,
      LILYPAD_COUNT,
      sceneW,
      sceneH,
      screenScale,
    );
    const lpRenderer = new LilypadRenderer(gl);
    let lotuses = new Lotuses(rng, LOTUS_COUNT, sceneW, sceneH, screenScale);
    const lotusRenderer = new LotusRenderer(gl);
    const water = new WaterRenderer(gl);
    const shadow = new ShadowRenderer(gl);
    let treats = new Treats(screenScale);
    const treatRenderer = new TreatRenderer(gl);
    let ripples = new Ripples(screenScale);
    const mouse = { x: width / 2, y: height / 2 };
    const prevMouse = { x: width / 2, y: height / 2 };
    let uScroll = 0; // parallax offset into the pond, logical px

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || DPR_FALLBACK, MAX_DPR);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      water.resize(canvas.width, canvas.height);
      shadow.resize(canvas.width, canvas.height, dpr);
    };
    sizeCanvas();

    // Per-frame: pick the visible vertical slice. The pond traverses its full
    // height as the page scrolls, but slower in absolute px.
    const recomputeScroll = () => {
      const innerH = window.innerHeight;
      const scrollH = docScrollHeight();
      sceneH = Math.max(innerH, scrollH * SCENE_FRACTION);
      const docMax = scrollH - innerH;
      const sceneMax = sceneH - innerH;
      const parallax = docMax > 0 ? sceneMax / docMax : 0;
      uScroll = clamp(window.scrollY * parallax, 0, Math.max(0, sceneMax));
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
      sceneH = Math.max(height, docScrollHeight() * SCENE_FRACTION);
      // Fish first, matching init RNG-draw order so decoration placement
      // stays consistent with first load.
      fishes = makeFishes();
      ordered = buildOrdered();
      lilypads = new Lilypads(rng, LILYPAD_COUNT, sceneW, sceneH, screenScale);
      lotuses = new Lotuses(rng, LOTUS_COUNT, sceneW, sceneH, screenScale);
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
      const sy = e.clientY + uScroll;
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
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, DT_CLAMP_S);
      last = now;
      recomputeScroll();
      // A still/slow pointer reads as null so Fish.resolve skips avoidance.
      const mv = dt > 0 ? mag(sub(mouse, prevMouse)) / dt : 0;
      prevMouse.x = mouse.x;
      prevMouse.y = mouse.y;
      // Lift cursor from client into scene space so fish dodge it when scrolled.
      let mouseScene: Vec2 | null = null;
      if (mv > MOUSE_FAST_PXS * screenScale) {
        mouseSceneObj.x = mouse.x;
        mouseSceneObj.y = mouse.y + uScroll;
        mouseScene = mouseSceneObj;
      }
      // A fresh poke overrides the cursor flee: fish bolt from that spot.
      if (scare.t > 0) scare.t -= dt;
      const avoid: Vec2 | null = scare.t > 0 ? scare : mouseScene;
      treats.resolve(dt);
      ripples.resolve(dt);
      const treatList = treats.list();
      for (const { fish } of fishes)
        fish.resolve(dt, avoid, treatList, sceneW, sceneH);
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

      // Caster pass casts real silhouettes into the height mask. No MAX-blend,
      // so order strictly bottom-to-top (deepest fish .. lotuses): the topmost
      // caster over a texel overwrites, so its MSAA edge composites cleanly
      // with no overlap outline.
      shadow.begin();
      for (const { fish, geo } of ordered) {
        renderer.cast(geo, width, height, fishHeight(fish.depth), uScroll);
      }
      lpRenderer.cast(inst.data, inst.count, width, height, uScroll);
      lotusRenderer.cast(
        lotusInst.data,
        lotusInst.count,
        width,
        height,
        uScroll,
      );
      shadow.end();
      renderer.prepareShadow(shadow.tex, canvas.width, canvas.height);
      // Lilypads are NOT captured here — they float on the surface and draw
      // on top of the water pass, so no ripple/refraction touches them.
      water.beginScene();
      for (const { fish, geo, palette } of ordered) {
        renderer.draw(geo, width, height, fish.depth, palette, uScroll);
      }

      // Treats sink, so render into the scene MRT before the water pass —
      // depth tint + refraction wash over them as they descend.
      const tInst = treats.renderInstances();
      treatRenderer.draw(tInst.data, tInst.count, width, height, uScroll);

      // Water pass runs in screen space against the already-scrolled scene,
      // so each source's cy is shifted by -uScroll. Pads/lotuses keep their
      // static rim (foam=true) at amp 1; click rings and treat splashes are
      // travelling-only (foam=false) with decaying amp. Emission order
      // (pads, lotuses, click rings, treats) is fixed so the MAX_RIPPLES cap
      // is stable; click rings precede treats so a poke never starves.
      water.beginRipples();
      const instFloats = inst.count * LILYPAD_INST_FLOATS;
      for (let b = 0; b < instFloats; b += LILYPAD_INST_FLOATS) {
        water.addRipple(
          inst.data[b],
          inst.data[b + 1] - uScroll,
          inst.data[b + 2],
          inst.data[b + 3],
          inst.data[b + 4],
          1,
          true,
        );
      }
      lotuses.emitRipples(water, uScroll);
      ripples.emitRipples(water, uScroll);
      treats.emitRipples(water, uScroll);
      water.composite(width, height, now / 1000, shadow.tex, screenScale);
      lpRenderer.draw(
        inst.data,
        inst.count,
        width,
        height,
        uScroll,
        shadow.tex,
        canvas.width,
        canvas.height,
      );
      lotusRenderer.draw(
        lotusInst.data,
        lotusInst.count,
        width,
        height,
        uScroll,
      );
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
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
