import type { FigureTheme } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import { LotusRenderer } from "@/render/LotusRenderer";
import {
  DEEP_DARK,
  DEEP_LIGHT,
} from "@/render/WaterRenderer";
import { BG_DARK, BG_LIGHT } from "@/render/frame";
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
import { FIGURE_FOAM_FRAC } from "@/figures/units";

// Shared scene for the wiper figures in the post (flat-vs-toon,
// shadows-on-off): a randomized layout of 3 lilypads + 2 lotuses fitted
// into the panel, with the foam-disk uniforms packed for the composite
// shader. Each figure owns its own composite shader and offscreen target
// but reuses this for the lily+lotus pass, the per-frame petal flutter,
// and the disk uniform buffers — keeps both figures visually in lockstep.

const FIGURE_SEED = 0xc0ffee01;
const LILY_COUNT = 3;
const LOTUS_COUNT = 2;
export const MAX_DISKS = LILY_COUNT + LOTUS_COUNT;
const MAX_PLACE_ATTEMPTS = 80;
// Min clear water between disk rims, panel-height fraction. Slightly larger
// than the ripple band so foam collars stay legible.
const ITEM_GAP_FRAC = 0.04;

// Per-item size ranges as panel-height fractions. Picked so 3 lilies + 2
// lotuses fit at the standard 2.4 aspect without the layout looking forced.
const LILY_R_FRAC: [number, number] = [0.13, 0.20];
const LILY_NOTCH: [number, number] = [0.12, 0.22];
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
  reach: number;
  seed: number;
}

function generateLayout(
  rng: () => number, w: number, h: number,
): { lilies: LilyPlacement[]; lotuses: LotusPlacement[] } {
  const lilies: LilyPlacement[] = [];
  const lotuses: LotusPlacement[] = [];
  const gap = h * ITEM_GAP_FRAC;
  const pad = h * 0.06;

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

export class LilyLotusFigureScene {
  readonly lily: LilypadRenderer;
  readonly lotus: LotusRenderer;
  readonly theme: ThemeMixer;

  readonly diskBuf = new Float32Array(MAX_DISKS * 4);
  readonly notchBuf = new Float32Array(MAX_DISKS);
  readonly seedBuf = new Float32Array(MAX_DISKS);
  diskCount = 0;

  private lilies: LilyPlacement[] = [];
  private lotuses: LotusPlacement[] = [];
  private lilyInst = new Float32Array(LILY_COUNT * LILYPAD_INST_FLOATS);
  private lotusPerBloomFloats = lotusPetalCount(LOTUS_RING_COUNT) * LOTUS_INST_FLOATS;
  private lotusInst = new Float32Array(LOTUS_COUNT * this.lotusPerBloomFloats);
  private lotusBloomScratch = new Float32Array(this.lotusPerBloomFloats);
  private lotusInstCount = 0;

  private w = 0;
  private h = 0;
  private lastT: number | null = null;

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.lily = new LilypadRenderer(gl);
    this.lotus = new LotusRenderer(gl);
    this.theme = new ThemeMixer(theme);
    this.lily.setTheme(this.theme.mix);
    this.lotus.setTheme(this.theme.mix);
  }

  setTheme(theme: FigureTheme): void {
    this.theme.setTarget(theme);
  }

  // Deterministic from FIGURE_SEED so the same panel size always reproduces
  // the same scene. A different size reroll because rejection-sampling
  // consumes a different number of rng() calls. Sizes are world-unit
  // fractions of the panel, so no scale needs storing
  // without re-deriving from canvas width.
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;

    const rng = mulberry32(FIGURE_SEED);
    const layout = generateLayout(rng, w, h);
    this.lilies = layout.lilies;
    this.lotuses = layout.lotuses;

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
    for (; i < MAX_DISKS; i++) {
      this.diskBuf[i * 4 + 0] = 0;
      this.diskBuf[i * 4 + 1] = 0;
      this.diskBuf[i * 4 + 2] = 0;
      this.diskBuf[i * 4 + 3] = 0;
      this.notchBuf[i] = 0;
      this.seedBuf[i] = 0;
    }
    this.diskCount = this.lilies.length + this.lotuses.length;
  }

  // Eases the theme palette (~250ms) and repacks the per-petal flutter for
  // every lotus. Returns the eased water palette so the caller can push it
  // straight into its composite shader uniforms.
  frame(t: number): { bg: [number, number, number]; deep: [number, number, number] } {
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    if (this.theme.advance(dt)) {
      this.lily.setTheme(this.theme.mix);
      this.lotus.setTheme(this.theme.mix);
    }

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

    return {
      bg: lerpRgb(BG_DARK, BG_LIGHT, this.theme.mix),
      deep: lerpRgb(DEEP_DARK, DEEP_LIGHT, this.theme.mix),
    };
  }

  // Visible pass: caller binds the target FBO + sets the viewport first.
  drawScene(): void {
    this.lily.draw(this.lilyInst, this.lilies.length, this.w, this.h, 0);
    this.lotus.draw(this.lotusInst, this.lotusInstCount, this.w, this.h, 0);
  }

  // Caster pass: caller wraps in ShadowRenderer.begin()/end(). `shadowScale`
  // must match what was passed to ShadowRenderer.resize() and what the
  // receiver shader uploads via applyFigureShadowUniforms — see shadowHelpers.
  // Geometry is already in world units, so the cast pass needs no scale.
  castShadows(): void {
    this.lily.cast(this.lilyInst, this.lilies.length, this.w, this.h, 0);
    this.lotus.cast(this.lotusInst, this.lotusInstCount, this.w, this.h, 0);
  }

  get themeMix(): number {
    return this.theme.mix;
  }

  dispose(): void {
    this.lily.dispose();
    this.lotus.dispose();
  }
}
