import { createProgram, OffscreenTarget } from "@/lib/gl";
import type { FigureModule, FigureTheme, PointerInfo, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import { LotusRenderer } from "@/render/LotusRenderer";
import {
  DEEP_DARK,
  DEEP_LIGHT,
  RIPPLE_CREST,
  SHEEN,
} from "@/render/WaterRenderer";
import { BG_DARK, BG_LIGHT } from "@/render/frame";
import {
  bindNoiseUniform,
  buildNoiseTexture,
  NOISE_TEX_UNIT,
} from "@/render/noiseTexture";
import { ThemeMixer, lerpRgb } from "@/figures/theme";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import {
  LOTUS_INST_FLOATS,
  buildSingleLotusInstances,
  lotusPetalCount,
  lotusReach,
} from "@/sim/Lotuses";
import { hslToRgb } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import { PALETTE as P } from "@/figures/palette";
import { FIGURE_FOAM_FRAC } from "@/figures/scale";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/flatVsToon.frag.glsl";

// Figure layout: 3 lilypads + 2 lotuses, rejection-sampled inside the panel.
// Stable across renders (deterministic RNG seeded with FIGURE_SEED).
const FIGURE_SEED = 0xc0ffee01;
const LILY_COUNT = 3;
const LOTUS_COUNT = 2;
const MAX_DISKS = LILY_COUNT + LOTUS_COUNT;
const MAX_PLACE_ATTEMPTS = 80;
// Min clear water between disk rims, panel-height fraction. Slightly larger
// than the ripple band so foam collars stay legible.
const ITEM_GAP_FRAC = 0.04;

// Per-item size ranges as panel-height fractions. Picked so 3 lilies + 2
// lotuses fit at the standard 2.4 aspect without the layout looking forced.
const LILY_R_FRAC: [number, number] = [0.13, 0.20];
const LILY_NOTCH: [number, number] = [0.12, 0.22]; // production NOTCH_HALF range
const LOTUS_SIZE_FRAC: [number, number] = [0.13, 0.18];
// HSL bands lifted from src/sim/Lilypads.ts (PAD_HUE/SAT/LIGHT).
const PAD_HUE: [number, number] = [0.22, 0.42];
const PAD_SAT: [number, number] = [0.35, 0.6];
const PAD_LIGHT: [number, number] = [0.28, 0.45];

const LOTUS_RING_COUNT = 3;
const TAU = Math.PI * 2;

const lerp = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;

interface LilyPlacement {
  x: number; y: number;
  radius: number;
  rot: number;
  notch: number;
  seed: number;
  color: [number, number, number];
}
interface LotusPlacement {
  x: number; y: number;
  size: number;
  baseAngle: number;
  reach: number; // outermost petal tip, from sim/Lotuses.lotusReach
  seed: number;
}

// Rejection-sampled layout. Each item is checked against every already-placed
// item using its full footprint radius (lily.radius / lotus.reach) plus a
// fixed gap, so the foam collars never touch.
function generateLayout(
  rng: () => number, w: number, h: number,
): { lilies: LilyPlacement[]; lotuses: LotusPlacement[] } {
  const lilies: LilyPlacement[] = [];
  const lotuses: LotusPlacement[] = [];
  const gap = h * ITEM_GAP_FRAC;
  const pad = h * 0.06; // keep disks fully on-canvas

  const fits = (x: number, y: number, r: number): boolean =>
    x - r >= pad && x + r <= w - pad &&
    y - r >= pad && y + r <= h - pad;

  const overlaps = (x: number, y: number, r: number): boolean => {
    for (const L of lilies) {
      if (Math.hypot(x - L.x, y - L.y) < r + L.radius + gap) return true;
    }
    for (const L of lotuses) {
      if (Math.hypot(x - L.x, y - L.y) < r + L.reach + gap) return true;
    }
    return false;
  };

  // Lilies first — larger items first reduces the chance the lotuses can't fit.
  for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS && lilies.length < LILY_COUNT; attempt++) {
    const radius = h * lerp(LILY_R_FRAC[0], LILY_R_FRAC[1], rng());
    const x = pad + radius + rng() * Math.max(0, w - 2 * (pad + radius));
    const y = pad + radius + rng() * Math.max(0, h - 2 * (pad + radius));
    if (!fits(x, y, radius) || overlaps(x, y, radius)) continue;
    const c = hslToRgb(
      lerp(PAD_HUE[0], PAD_HUE[1], rng()),
      lerp(PAD_SAT[0], PAD_SAT[1], rng()),
      lerp(PAD_LIGHT[0], PAD_LIGHT[1], rng()),
    );
    lilies.push({
      x, y, radius,
      rot: rng() * TAU,
      notch: lerp(LILY_NOTCH[0], LILY_NOTCH[1], rng()),
      seed: rng() * 100,
      color: [c[0], c[1], c[2]],
    });
  }

  for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS && lotuses.length < LOTUS_COUNT; attempt++) {
    const size = h * lerp(LOTUS_SIZE_FRAC[0], LOTUS_SIZE_FRAC[1], rng());
    const reach = lotusReach(size, LOTUS_RING_COUNT);
    const x = pad + reach + rng() * Math.max(0, w - 2 * (pad + reach));
    const y = pad + reach + rng() * Math.max(0, h - 2 * (pad + reach));
    if (!fits(x, y, reach) || overlaps(x, y, reach)) continue;
    lotuses.push({
      x, y, size,
      baseAngle: rng() * TAU,
      reach,
      seed: rng() * 100,
    });
  }

  return { lilies, lotuses };
}

class FlatVsToonSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private lily: LilypadRenderer;
  private lotus: LotusRenderer;
  private prog: WebGLProgram;
  private uScene: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uWiper: WebGLUniformLocation;
  private uBg: WebGLUniformLocation;
  private uDeep: WebGLUniformLocation;
  private uSheen: WebGLUniformLocation;
  private uRippleCrest: WebGLUniformLocation;
  private uDiskCount: WebGLUniformLocation;
  private uDisks: WebGLUniformLocation;
  private uNotch: WebGLUniformLocation;
  private uSeed: WebGLUniformLocation;
  private uHandleDot: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;
  private scene: OffscreenTarget;
  // Shared baked noise (RG = curl, B = scalar FBM). Bound on the reserved
  // unit so foam + crest sample exactly what production rippleMask.frag.glsl
  // sees at runtime.
  private noiseTex: WebGLTexture;

  private w = 0;
  private h = 0;
  private time = 0;
  private lastT: number | null = null;
  private wiper = 0.5;
  private dragging = false;
  private theme: ThemeMixer;

  // Layout-derived, regenerated on resize from FIGURE_SEED.
  private lilies: LilyPlacement[] = [];
  private lotuses: LotusPlacement[] = [];
  private lilyInst = new Float32Array(LILY_COUNT * LILYPAD_INST_FLOATS);
  private lotusPerBloomFloats = lotusPetalCount(LOTUS_RING_COUNT) * LOTUS_INST_FLOATS;
  private lotusInst = new Float32Array(LOTUS_COUNT * this.lotusPerBloomFloats);
  private lotusBloomScratch = new Float32Array(this.lotusPerBloomFloats);
  private lotusInstCount = 0;
  private diskBuf = new Float32Array(MAX_DISKS * 4);
  private notchBuf = new Float32Array(MAX_DISKS);
  private seedBuf = new Float32Array(MAX_DISKS);

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.lily = new LilypadRenderer(gl);
    this.lotus = new LotusRenderer(gl);
    this.theme = new ThemeMixer(theme);
    // Snap the renderers to the initial mix so first paint is settled.
    this.lily.setTheme(this.theme.mix);
    this.lotus.setTheme(this.theme.mix);
    this.prog = createProgram(gl, VS, FS);
    this.uScene = gl.getUniformLocation(this.prog, "u_scene")!;
    this.uRes = gl.getUniformLocation(this.prog, "u_res")!;
    this.uTime = gl.getUniformLocation(this.prog, "u_time")!;
    this.uWiper = gl.getUniformLocation(this.prog, "u_wiper")!;
    this.uBg = gl.getUniformLocation(this.prog, "u_bg")!;
    this.uDeep = gl.getUniformLocation(this.prog, "u_deep")!;
    this.uSheen = gl.getUniformLocation(this.prog, "u_sheen")!;
    this.uRippleCrest = gl.getUniformLocation(this.prog, "u_rippleCrest")!;
    this.uDiskCount = gl.getUniformLocation(this.prog, "u_diskCount")!;
    this.uDisks = gl.getUniformLocation(this.prog, "u_disks")!;
    this.uNotch = gl.getUniformLocation(this.prog, "u_notch")!;
    this.uSeed = gl.getUniformLocation(this.prog, "u_seed")!;
    this.uHandleDot = gl.getUniformLocation(this.prog, "u_handleDot")!;
    this.vao = gl.createVertexArray()!;
    this.scene = new OffscreenTarget(gl);
    this.noiseTex = buildNoiseTexture(gl);
    gl.activeTexture(gl.TEXTURE0 + NOISE_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);
    bindNoiseUniform(gl, this.prog);
  }

  setTheme(theme: FigureTheme) {
    this.theme.setTarget(theme);
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;

    // Regenerate layout deterministically. A fresh RNG each resize means the
    // same FIGURE_SEED reproduces an identical scene at the same panel size;
    // a different size will reroll because rejection-sampling consumes
    // different attempt counts.
    const rng = mulberry32(FIGURE_SEED);
    const layout = generateLayout(rng, w, h);
    this.lilies = layout.lilies;
    this.lotuses = layout.lotuses;

    // Pack the lily instance buffer once — positions/sizes are constant.
    let o = 0;
    for (const L of this.lilies) {
      this.lilyInst[o++] = L.x;
      this.lilyInst[o++] = L.y;
      this.lilyInst[o++] = L.radius;
      this.lilyInst[o++] = L.rot;
      this.lilyInst[o++] = L.notch;
      this.lilyInst[o++] = L.seed;
      this.lilyInst[o++] = L.color[0];
      this.lilyInst[o++] = L.color[1];
      this.lilyInst[o++] = L.color[2];
    }

    // Foam disk uniforms: one entry per item, in the same order as the renderer
    // draws them. Lily disks are notched; lotuses are plain disks at the
    // bloom's ripple radius.
    let i = 0;
    for (const L of this.lilies) {
      this.diskBuf[i * 4 + 0] = L.x;
      this.diskBuf[i * 4 + 1] = L.y;
      this.diskBuf[i * 4 + 2] = L.radius;
      this.diskBuf[i * 4 + 3] = L.rot;
      this.notchBuf[i] = L.notch;
      this.seedBuf[i] = L.seed;
      i++;
    }
    for (const L of this.lotuses) {
      this.diskBuf[i * 4 + 0] = L.x;
      this.diskBuf[i * 4 + 1] = L.y;
      this.diskBuf[i * 4 + 2] = L.reach * FIGURE_FOAM_FRAC;
      this.diskBuf[i * 4 + 3] = 0;
      this.notchBuf[i] = 0;
      this.seedBuf[i] = L.seed;
      i++;
    }
    // Zero out unused tail slots so old data can't leak through if the layout
    // ever shrinks below MAX_DISKS.
    for (; i < MAX_DISKS; i++) {
      this.diskBuf[i * 4 + 0] = 0;
      this.diskBuf[i * 4 + 1] = 0;
      this.diskBuf[i * 4 + 2] = 0;
      this.diskBuf[i * 4 + 3] = 0;
      this.notchBuf[i] = 0;
      this.seedBuf[i] = 0;
    }

    this.scene.resize(
      Math.max(1, Math.round(w * dpr)),
      Math.max(1, Math.round(h * dpr)),
    );
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.dragging = true;
      this.wiper = Math.min(Math.max(p.x / this.w, 0), 1);
    } else if (p.type === "move" && this.dragging) {
      this.wiper = Math.min(Math.max(p.x / this.w, 0), 1);
    } else if (p.type === "up") {
      this.dragging = false;
    }
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;

    // Ease the pond palette toward the active theme (~250ms) so a toggle
    // fades the water/lily/lotus in lockstep with the CSS frost transition,
    // exactly like the production pond.
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    if (this.theme.advance(dt)) {
      this.lily.setTheme(this.theme.mix);
      this.lotus.setTheme(this.theme.mix);
    }
    const bg = lerpRgb(BG_DARK, BG_LIGHT, this.theme.mix);
    const deep = lerpRgb(DEEP_DARK, DEEP_LIGHT, this.theme.mix);

    // Refresh petal angles in place (flutter only — base placement is
    // constant). Each bloom's petals come out of buildSingleLotusInstances
    // and are concatenated into the shared instance buffer; one instanced
    // draw renders all of them.
    let o = 0;
    for (const L of this.lotuses) {
      const { count } = buildSingleLotusInstances(
        this.lotusBloomScratch, L.x, L.y, L.size, t,
        { rings: LOTUS_RING_COUNT, baseAngle: L.baseAngle },
      );
      this.lotusInst.set(this.lotusBloomScratch.subarray(0, count * LOTUS_INST_FLOATS), o);
      o += count * LOTUS_INST_FLOATS;
    }
    this.lotusInstCount = o / LOTUS_INST_FLOATS;

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to the
    // default fb — otherwise the composite stretches into the letterbox.
    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Render scene (lilies + lotuses on transparent bg) into the offscreen
    // FBO. The LilypadRenderer / LotusRenderer manage their own blend state.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.lily.draw(this.lilyInst, this.lilies.length, w, h, 0);
    this.lotus.draw(this.lotusInst, this.lotusInstCount, w, h, 0);

    // 2) Composite back into the framework's viewport on the default fb.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform2f(this.uRes, w, h);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform1f(this.uWiper, this.wiper);
    // Pond palette — eased between dark/light per current theme so the
    // figure matches the production water shader frame-for-frame.
    gl.uniform3f(this.uBg, bg[0], bg[1], bg[2]);
    gl.uniform3f(this.uDeep, deep[0], deep[1], deep[2]);
    gl.uniform1f(this.uSheen, SHEEN);
    gl.uniform1f(this.uRippleCrest, RIPPLE_CREST);
    gl.uniform1i(this.uDiskCount, this.lilies.length + this.lotuses.length);
    gl.uniform4fv(this.uDisks, this.diskBuf);
    gl.uniform1fv(this.uNotch, this.notchBuf);
    gl.uniform1fv(this.uSeed, this.seedBuf);
    // Grab-dot colour comes from the shared figure palette so the figure
    // never drifts from the rest of the post's accent teal.
    gl.uniform3f(this.uHandleDot, P.accentGL[0], P.accentGL[1], P.accentGL[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    this.lily.dispose();
    this.lotus.dispose();
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    this.scene.dispose();
    gl.deleteTexture(this.noiseTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new FlatVsToonSketch(host.gl, theme);
  },
};

export default mod;
