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
import { mag, sub, type Vec2 } from "@/lib/math";
import { mulberry32, pickKoiColors } from "@/sim/koiPattern";

// --- Scene tuning ----------------------------------------------------------
const FISH_COUNT = 7;
const FISH_SCALE_MEAN = 0.75; // average size vs the original single fish
const FISH_SCALE_VAR = 0.2; // +/- fraction around the mean
const SPAWN_INSET = 0.15; // keep initial spawns off the very edges
const FISH_DEPTH_MIN = 0.18; // fixed per-fish submergence range (no bob)
const FISH_DEPTH_MAX = 0.68;
const LILYPAD_COUNT = 18;
const LOTUS_COUNT = 9;
const MAX_DPR = 2; // don't supersample past 2x
const DPR_FALLBACK = 1; // when devicePixelRatio is unavailable
const DT_CLAMP_S = 0.1; // cap dt so a backgrounded tab doesn't teleport
// The pond is a tall virtual scene; only a viewport-sized slice is drawn. Its
// height is a fraction of the page content, so it scrolls slower than the page.
const SCENE_FRACTION = 0.4;
const REF_WIDTH = 1440; // viewport width at which sizes are 1x
const SCREEN_SCALE_MIN = 0.6;
const SCREEN_SCALE_MAX = 1.4;
const RESIZE_DEBOUNCE_MS = 150; // settle before the heavy realloc/reseed
const MOUSE_FAST_PXS = 650; // cursor speed (px/s) above which fish flee

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export default function FishBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Context MSAA antialiases the fish silhouette; the body pattern keeps its
    // own fwidth-based edge AA. We render straight to the default framebuffer.
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
    // nor tiny on a 4k monitor. The pond spans SCENE_FRACTION of the content
    // (>= one viewport so there's always room to swim).
    let screenScale = clamp(
      width / REF_WIDTH,
      SCREEN_SCALE_MIN,
      SCREEN_SCALE_MAX,
    );
    let sceneW = width;
    let sceneH = Math.max(height, docScrollHeight() * SCENE_FRACTION);

    // One distinct palette per fish, each baked into its own pattern texture.
    const palettes = Array.from({ length: FISH_COUNT }, () =>
      pickKoiColors(rng),
    );
    const renderer = new FishRenderer(gl);
    renderer.setPalettes(palettes);

    // A small school: each fish starts somewhere in the pond, at a slightly
    // varied size (mean 0.75x * screenScale), with its own swim personality.
    const fishes = palettes.map((p, i) => {
      const scale =
        FISH_SCALE_MEAN * (1 + (rng() * 2 - 1) * FISH_SCALE_VAR) * screenScale;
      const fish = new Fish(
        {
          x: sceneW * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
          y: sceneH * (SPAWN_INSET + rng() * (1 - 2 * SPAWN_INSET)),
        },
        { base: p.base, mid: p.mid, accent: p.accent, fin: p.fin },
        FISH_DEPTH_MIN + rng() * (FISH_DEPTH_MAX - FISH_DEPTH_MIN), // fixed depth
        scale,
        {
          cruiseSpeed: 3.5 + rng() * 2.5,
          turnRateMult: 0.45 + rng() * 0.3,
          noisePhaseHeading: rng() * 1000,
          noisePhaseSpeed: rng() * 1000,
          seed: (rng() * 2 ** 32) >>> 0,
        },
      );
      return { fish, palette: i };
    });
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
    const mouse = { x: width / 2, y: height / 2 };
    const prevMouse = { x: width / 2, y: height / 2 };
    let uScroll = 0; // parallax offset into the tall pond, logical px

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

    // Cheap, per-frame: pick the visible vertical slice. The pond traverses
    // its full height as the page scrolls, but slower in absolute px.
    const recomputeScroll = () => {
      const innerH = window.innerHeight;
      const scrollH = docScrollHeight();
      sceneH = Math.max(innerH, scrollH * SCENE_FRACTION);
      const docMax = scrollH - innerH;
      const sceneMax = sceneH - innerH;
      const parallax = docMax > 0 ? sceneMax / docMax : 0;
      uScroll = clamp(window.scrollY * parallax, 0, Math.max(0, sceneMax));
    };

    // Heavy, debounced: reallocate GL buffers and reseed the static
    // decorations for the new size. Fish keep swimming (their scale is baked
    // at construction); soft-containment smoothly herds them into the new
    // bounds without a snap.
    const applyResize = () => {
      const nextW = window.innerWidth;
      const nextH = window.innerHeight;
      // ResizeObserver delivers an initial callback on observe(), and fires on
      // scrollbar/content-driven documentElement changes too. Only the actual
      // viewport changing warrants the heavy realloc + plant/treat reseed.
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
      lilypads = new Lilypads(rng, LILYPAD_COUNT, sceneW, sceneH, screenScale);
      lotuses = new Lotuses(rng, LOTUS_COUNT, sceneW, sceneH, screenScale);
      treats = new Treats(screenScale);
    };

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove);
    // A click drops a treat at the pointer; lift it into scene space (like the
    // cursor) so it stays put as the page scrolls.
    const onDown = (e: PointerEvent) => {
      treats.spawn(e.clientX, e.clientY + uScroll);
    };
    window.addEventListener("pointerdown", onDown);
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyResize, RESIZE_DEBOUNCE_MS);
    };
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(document.documentElement);

    // Reused across frames to keep the rAF loop allocation-free: a stable
    // holder list (sorted in place), the eat-dedupe scratch, and a single
    // mouse-in-scene-space object.
    const ordered = fishes.map((o) => ({
      fish: o.fish,
      palette: o.palette,
      geo: o.fish.buildGeometry(),
    }));
    const eaten: Treat[] = [];
    const mouseSceneObj = { x: 0, y: 0 };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Clamp dt so a backgrounded tab doesn't teleport the fish on resume.
      const dt = Math.min((now - last) / 1000, DT_CLAMP_S);
      last = now;
      recomputeScroll();
      // Only a fast-moving cursor scares the fish. Measure its speed (px/s)
      // from the per-frame delta; a still or slow pointer reads as null so
      // Fish.resolve skips avoidance entirely.
      const mv = dt > 0 ? mag(sub(mouse, prevMouse)) / dt : 0;
      prevMouse.x = mouse.x;
      prevMouse.y = mouse.y;
      // Cursor lives in client space; lift it into scene space so fish dodge
      // the real pointer even when scrolled.
      let mouseScene: Vec2 | null = null;
      if (mv > MOUSE_FAST_PXS) {
        mouseSceneObj.x = mouse.x;
        mouseSceneObj.y = mouse.y + uScroll;
        mouseScene = mouseSceneObj;
      }
      treats.resolve(dt);
      const treatList = treats.list();
      for (const { fish } of fishes)
        fish.resolve(dt, mouseScene, treatList, sceneW, sceneH);
      // A fish whose head reaches a treat eats it; it then resumes normal
      // wander (the treat is gone, so no seek force next frame).
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
      // Poses are built once here and reused for the shadow mask, the ripple
      // stream, and the visible plant passes (single source of truth/frame).
      const inst = lilypads.buildInstances();
      const lotusInst = lotuses.buildInstances();
      // Build each fish's geometry once; reuse it for the caster pass and the
      // visible pass. Deepest-first paint order (shallow draws on top). The
      // holder list + each fish's geometry buffers are reused (no alloc).
      ordered.sort((a, b) => b.fish.depth - a.fish.depth);
      for (const e of ordered) e.geo = e.fish.buildGeometry();

      // Caster pass: each object renders its REAL silhouette (pad notch,
      // lotus petals, fish body + fins) into the height mask. No MAX-blend now,
      // so cast strictly bottom-to-top (deepest fish first .. lotuses last) and
      // the topmost caster over a texel overwrites — its MSAA edge composited
      // cleanly over what's beneath, no overlap outline.
      shadow.begin();
      for (const { fish, geo } of ordered) {
        renderer.cast(geo, width, height, fishHeight(fish.depth), uScroll);
      }
      lpRenderer.cast(inst, width, height, uScroll);
      lotusRenderer.cast(
        lotusInst.data,
        lotusInst.count,
        width,
        height,
        uScroll,
      );
      shadow.end();
      renderer.prepareShadow(shadow.tex, canvas.width, canvas.height);
      // Capture the fish + background into the offscreen MSAA buffer. Lily-
      // pads are NOT captured — they float on the surface and are drawn on
      // top of the finished water pass so no ripple/refraction touches them.
      water.beginScene();
      for (const { fish, geo, palette } of ordered) {
        renderer.draw(geo, width, height, fish.depth, palette, uScroll);
      }

      // Treats sink under the surface, so they go into the scene MRT (with
      // the fish) before the water pass — depth tint + refraction wash over
      // them as they descend.
      const tInst = treats.renderInstances();
      treatRenderer.draw(tInst.data, tInst.count, width, height, uScroll);

      // Ripple sources fed straight into the water pass (no intermediate
      // array). It runs in screen space against the already-scrolled scene,
      // so each source's cy is shifted by -uScroll. Pads/lotuses are full
      // strength (amp = 1); a treat splash carries its own decaying amp.
      // Emission order (pads, lotuses, treats) matches the old build, so the
      // MAX_RIPPLES cap keeps the same sources.
      water.beginRipples();
      for (let b = 0; b < inst.length; b += LILYPAD_INST_FLOATS) {
        water.addRipple(
          inst[b],
          inst[b + 1] - uScroll,
          inst[b + 2],
          inst[b + 3],
          inst[b + 4],
          1,
        );
      }
      lotuses.emitRipples(water, uScroll);
      treats.emitRipples(water, uScroll);
      // Refract/ripple the captured scene onto the default framebuffer...
      water.composite(width, height, now / 1000, shadow.tex);
      // ...then lay the lilypads on top, above all ripples...
      lpRenderer.draw(
        inst,
        width,
        height,
        uScroll,
        shadow.tex,
        canvas.width,
        canvas.height,
      );
      // ...and the lotus blooms on top of everything.
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
