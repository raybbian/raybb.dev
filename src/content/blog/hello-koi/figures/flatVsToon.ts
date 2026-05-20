import { createProgram } from "@/lib/gl";
import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import { LotusRenderer } from "@/render/LotusRenderer";
import {
  DEEP_DARK,
  RIPPLE_CREST,
  SHEEN,
} from "@/render/WaterRenderer";
import { BG_DARK } from "@/render/frame";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { LOTUS_INST_FLOATS } from "@/sim/Lotuses";
import { hslToRgb } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import { PALETTE as P } from "@/figures/palette";
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
// Mirrors the constants in src/sim/Lotuses.ts (INNER_START, RING_STEP,
// LEN_FRAC, HALF_FRAC, ring petal counts). Kept inline so the figure stays a
// self-contained snapshot rather than reaching into sim internals — the
// production sim builds these from a random band layout, which would be
// overkill (and time-varying) here.
const INNER_START = 0.08;
const RING_STEP = 0.17;
const LEN_FRAC = [0.48, 0.58];
const HALF_FRAC = [0.27, 0.34];
const PETALS_INNER = 5;
const PETALS_OUTER = 10;
const FLUTTER_AMP = 0.025;
const FLUTTER_W = 1.6;
// Foam disk follows Lotuses.RIPPLE_RADIUS_FRAC (0.6) of reach: pulls the
// foam collar inside the petals so it overlaps the bloom edge.
const LOTUS_RIPPLE_FRAC = 0.6;

const TAU = Math.PI * 2;
const PINK_HUE = 0.95;
const BLUE_HUE = 0.575;

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
  reach: number; // outermost petal tip
  seed: number;
}

// Compute the lotus outermost-petal tip distance from its centre. The figure
// places lotuses by `reach` so a bloom never overlaps another bloom or a pad
// rim. Matches src/sim/Lotuses.ts placeBandLotuses computation.
function lotusReachFor(size: number): number {
  const maxInner = INNER_START + RING_STEP * (LOTUS_RING_COUNT - 1);
  return size * (maxInner + LEN_FRAC[1]);
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
    const reach = lotusReachFor(size);
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

// Petal count for one lotus (3 rings, ringPetals interpolated between inner
// and outer). Same formula as buildLotusPetals; extracted so we can size the
// instance buffer up front.
function lotusPetalCount(): number {
  let n = 0;
  for (let j = 0; j < LOTUS_RING_COUNT; j++) {
    const fr = j / (LOTUS_RING_COUNT - 1);
    n += Math.round(PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr);
  }
  return n;
}

// Writes one bloom's petal instances into `out` starting at index `o` (in
// floats). Returns the new offset. Mirrors the per-frame loop in
// src/sim/Lotuses.ts buildInstances().
function writeLotusPetals(
  out: Float32Array, o: number,
  cx: number, cy: number, size: number, baseAngle: number,
  t: number,
): number {
  // Outermost ring first: petals are alpha-blended in draw order, so inner
  // rings end up on top — same paint order the production Lotuses.ts uses.
  for (let j = LOTUS_RING_COUNT - 1; j >= 0; j--) {
    const fr = j / (LOTUS_RING_COUNT - 1);
    const inner = size * (INNER_START + RING_STEP * j);
    const len = size * (LEN_FRAC[0] + (LEN_FRAC[1] - LEN_FRAC[0]) * fr);
    const half = size * (HALF_FRAC[0] + (HALF_FRAC[1] - HALF_FRAC[0]) * fr);
    const ringPetals = Math.round(
      PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr,
    );
    // Saturated pink centre -> white outer ring (light theme tints).
    const sat = 0.72 + (0.06 - 0.72) * fr;
    const light = 0.74 + (0.97 - 0.74) * fr;
    const c = hslToRgb(PINK_HUE, sat, light);
    const satD = 0.85 + (0.8 - 0.85) * fr;
    const lightD = 0.66 + (0.29 - 0.66) * fr;
    const cD = hslToRgb(BLUE_HUE, satD, lightD);
    const ringOffset = baseAngle + (j % 2) * (Math.PI / ringPetals);
    for (let k = 0; k < ringPetals; k++) {
      const angle0 = ringOffset + (k / ringPetals) * TAU;
      const flutterP = (j * 7.3 + k * 2.1) % TAU;
      const flutter = FLUTTER_AMP * Math.sin(t * FLUTTER_W + flutterP);
      out[o++] = cx;
      out[o++] = cy;
      out[o++] = angle0 + flutter;
      out[o++] = len;
      out[o++] = half;
      out[o++] = inner;
      out[o++] = c[0];
      out[o++] = c[1];
      out[o++] = c[2];
      out[o++] = cD[0];
      out[o++] = cD[1];
      out[o++] = cD[2];
      out[o++] = flutterP;
    }
  }
  return o;
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

  // Offscreen scene capture: lilies + lotuses drawn here every frame, then
  // the composite reads it as a texture.
  private fbo: WebGLFramebuffer;
  private sceneTex: WebGLTexture;
  private fboW = 0;
  private fboH = 0;
  // 1x1 zero shadow texture so the lily shader's u_shadow has something to
  // sample. RGBA8 with all zeros makes shadowHit() return 0 everywhere.
  private shadowTex: WebGLTexture;

  private w = 0;
  private h = 0;
  private time = 0;
  private wiper = 0.5;
  private dragging = false;

  // Layout-derived, regenerated on resize from FIGURE_SEED.
  private lilies: LilyPlacement[] = [];
  private lotuses: LotusPlacement[] = [];
  private lilyInst = new Float32Array(LILY_COUNT * LILYPAD_INST_FLOATS);
  private lotusInst = new Float32Array(LOTUS_COUNT * lotusPetalCount() * LOTUS_INST_FLOATS);
  private lotusInstCount = 0;
  private diskBuf = new Float32Array(MAX_DISKS * 4);
  private notchBuf = new Float32Array(MAX_DISKS);
  private seedBuf = new Float32Array(MAX_DISKS);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.lily = new LilypadRenderer(gl);
    this.lotus = new LotusRenderer(gl);
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

    this.fbo = gl.createFramebuffer()!;
    this.sceneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setTheme() {}

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
      this.diskBuf[i * 4 + 2] = L.reach * LOTUS_RIPPLE_FRAC;
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

    // Offscreen FBO at drawing-buffer resolution so the scene capture has the
    // same fidelity as the main canvas.
    const fw = Math.max(1, Math.round(w * dpr));
    const fh = Math.max(1, Math.round(h * dpr));
    if (fw !== this.fboW || fh !== this.fboH) {
      this.fboW = fw;
      this.fboH = fh;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
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

    // Refresh petal angles in place (flutter only — base placement is
    // constant). Each bloom's petals are written sequentially into the shared
    // instance buffer; one instanced draw renders all of them.
    let o = 0;
    for (const L of this.lotuses) {
      o = writeLotusPetals(this.lotusInst, o, L.x, L.y, L.size, L.baseAngle, t);
    }
    this.lotusInstCount = o / LOTUS_INST_FLOATS;

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to the
    // default fb — otherwise the composite stretches into the letterbox.
    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Render scene (lilies + lotuses on transparent bg) into the offscreen
    // FBO. The LilypadRenderer / LotusRenderer manage their own blend state.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.fboW, this.fboH);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.lily.draw(
      this.lilyInst, this.lilies.length, w, h, 0,
      this.shadowTex, this.fboW, this.fboH,
    );
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
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform2f(this.uRes, w, h);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform1f(this.uWiper, this.wiper);
    // Pond palette — same constants the production water shader reads. BG_DARK
    // is RGBA; the water shader only needs RGB.
    gl.uniform3f(this.uBg, BG_DARK[0], BG_DARK[1], BG_DARK[2]);
    gl.uniform3f(this.uDeep, DEEP_DARK[0], DEEP_DARK[1], DEEP_DARK[2]);
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
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.shadowTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new FlatVsToonSketch(host.gl);
  },
};

export default mod;
