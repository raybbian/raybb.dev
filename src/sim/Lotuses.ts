import { hslToRgb } from "@/sim/koiPattern";
import {
  CLICK_ATTACK,
  CLICK_RELEASE,
  clickScale,
  mulberry32,
  hash2,
} from "@/lib/math";
import type { PokeHit } from "@/sim/Lilypads";
import type { RippleSink } from "@/render/WaterRenderer";

// Instance layout: cx,cy, angle, len, half, inner, r,g,b (light theme),
// rD,gD,bD (dark theme), seed (noise phase). The shader lerps light<->dark.
export const LOTUS_INST_FLOATS = 13;

// Only `angle` (sway/flutter) and the size scale vary per frame.
interface Petal {
  baseAngle: number; // outward direction at rest, rad
  inner: number; // root distance from centre, px
  len: number; // root -> tip length, px
  half: number; // half-width at the base, px
  rgb: [number, number, number]; // light theme: pink centre -> white edge
  rgbDark: [number, number, number]; // dark theme: bright-blue centre -> dark-blue edge
  flutterP: number; // per-petal flutter phase
}

interface Lotus {
  hx: number;
  hy: number;
  petals: Petal[];
  reach: number; // worst-case footprint radius (peak bob), px
  swayAmp: number;
  swayW: number;
  swayP: number;
  bobAmp: number;
  bobW: number;
  bobP: number;
  clickT: number; // s into the current click phase; Infinity == idle
  held: boolean; // pointer still down on this bloom -> hold at peak size
}

// Ranges are [lo, hi], sampled per lotus via the seeded rng.
const TAU = Math.PI * 2;
// Placement biased away from screen centre so the koi stays readable.
const PLACE_CENTER = 0.5;
const PLACE_X_OFFSET: [number, number] = [0.1, 0.46];
const PLACE_Y: [number, number] = [0.06, 0.94];
const SIZE: [number, number] = [30, 49]; // overall lotus scale, px
const RING_COUNT: [number, number] = [3, 4]; // concentric petal rings
// Ring roots step out by a FIXED amount per ring, so fewer rings == a tighter
// bloom and petals always overlap (no gaps regardless of ringCount).
const INNER_START = 0.08; // innermost ring petal-root distance (frac of SIZE)
const RING_STEP = 0.17; // radial gap between consecutive rings (frac of SIZE)
const LEN_FRAC: [number, number] = [0.48, 0.58]; // petal length
const HALF_FRAC: [number, number] = [0.27, 0.34]; // petal half-width
const PETALS_INNER = 5; // petals in the innermost ring
const PETALS_OUTER = 10; // petals in the outermost ring
// Saturated pink centre -> white outer petals.
const PINK_HUE = 0.95;
const HUE_JITTER: [number, number] = [-0.03, 0.03]; // per-lotus hue shift
const CENTER_SL: [number, number] = [0.72, 0.74]; // [sat, light] at the centre
const EDGE_SL: [number, number] = [0.06, 0.97]; // [sat, light] at the outer edge
// Dark-theme palette: bright blue inner ring -> deep blue outer ring.
const BLUE_HUE = 0.575; // slightly green-leaning blue
const DARK_CENTER_SL: [number, number] = [0.85, 0.66]; // bright blue at the centre
const DARK_EDGE_SL: [number, number] = [0.8, 0.29]; // dark blue at the outer edge
const SWAY_AMP: [number, number] = [0.04, 0.1]; // rad
const SWAY_W: [number, number] = [0.25, 0.55]; // rad/s
const BOB_AMP: [number, number] = [0.015, 0.035]; // fraction of size
const BOB_W: [number, number] = [0.4, 0.9]; // rad/s
const FLUTTER_AMP = 0.025; // per-petal angular flutter, rad
const FLUTTER_W = 1.6; // per-petal flutter rate, rad/s
const MAX_PLACE_ATTEMPTS = 40;
const LOTUS_GAP = 10; // min clear water between lotus footprints, px
// <1 pulls the static foam collar inside the bloom so it overlaps the petals
// instead of leaving a ring of clean water around them.
const RIPPLE_RADIUS_FRAC = 0.6;

// The pond is infinite in Y; world-Y is partitioned into fixed bands whose
// blooms are a pure function of (seed, band index). Independent seed stream
// from the lilypads so the two fields don't visually correlate.
const BAND_H = 900; // world px per band
const BAND_MARGIN = 2; // bands kept beyond the visible window each side
const BAND_SEED_SALT = 0x4c4f5455; // "LOTU" — decorrelates from pad bands
// Per-band bloom count, drawn FIRST from the band RNG. Mean ~3 (1.5x the old
// 9 blooms / ~3680px scene).
const BAND_LOTUS_MIN = 2;
const BAND_LOTUS_SPAN = 3; // count = MIN + (rng()*SPAN | 0) -> [2,4]

// Places one band's blooms; Y lands in [bandTop, bandTop+bandH]. Rejection is
// band-local (bands are independent by design). Lilypads are ignored by
// design — a lotus may sit over and draw on one.
function placeBandLotuses(
  rng: () => number,
  count: number,
  width: number,
  bandTop: number,
  bandH: number,
  screenScale: number,
): Lotus[] {
  const lotuses: Lotus[] = [];
  const lerp = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const range = ([lo, hi]: [number, number]) => lerp(lo, hi);
  for (let i = 0; i < count; i++) {
    // Reject candidates whose footprint (peak bob) touches a placed lotus.
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
      const edge = rng() < 0.5 ? -1 : 1;
      const hx = width * (PLACE_CENTER + edge * range(PLACE_X_OFFSET));
      const hy = bandTop + range(PLACE_Y) * bandH;
      const size = range(SIZE) * screenScale;
      const bobAmp = range(BOB_AMP);
      const ringCount = Math.round(range(RING_COUNT));
      // Footprint = outermost ring's petal tip; depends on ringCount.
      const maxInner = INNER_START + RING_STEP * (ringCount - 1);
      const reach = size * (maxInner + LEN_FRAC[1]) * (1 + bobAmp);
      const clear = lotuses.every((q) => {
        const dx = q.hx - hx;
        const dy = q.hy - hy;
        return Math.hypot(dx, dy) >= reach + q.reach + LOTUS_GAP * screenScale;
      });
      if (!clear) continue;

      const baseAngle = rng() * TAU;
      const hueJitter = range(HUE_JITTER);
      // Emit rings outermost -> innermost: with alpha blending and no depth
      // test, paint order is draw order, so inner rings end up on top.
      const petals: Petal[] = [];
      for (let j = ringCount - 1; j >= 0; j--) {
        const fr = ringCount === 1 ? 0 : j / (ringCount - 1);
        const inner = size * (INNER_START + RING_STEP * j);
        const len = size * (LEN_FRAC[0] + (LEN_FRAC[1] - LEN_FRAC[0]) * fr);
        const half = size * (HALF_FRAC[0] + (HALF_FRAC[1] - HALF_FRAC[0]) * fr);
        const ringPetals = Math.round(
          PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr,
        );
        const sat = CENTER_SL[0] + (EDGE_SL[0] - CENTER_SL[0]) * fr;
        const light = CENTER_SL[1] + (EDGE_SL[1] - CENTER_SL[1]) * fr;
        const c = hslToRgb(PINK_HUE + hueJitter, sat, light);
        const rgb: [number, number, number] = [c[0], c[1], c[2]];
        const satD =
          DARK_CENTER_SL[0] + (DARK_EDGE_SL[0] - DARK_CENTER_SL[0]) * fr;
        const lightD =
          DARK_CENTER_SL[1] + (DARK_EDGE_SL[1] - DARK_CENTER_SL[1]) * fr;
        const cD = hslToRgb(BLUE_HUE + hueJitter, satD, lightD);
        const rgbDark: [number, number, number] = [cD[0], cD[1], cD[2]];
        // Offset alternate rings by half a step so petals nest into the gaps
        // of the ring beneath.
        const ringOffset = baseAngle + (j % 2) * (Math.PI / ringPetals);
        for (let k = 0; k < ringPetals; k++) {
          petals.push({
            baseAngle: ringOffset + (k / ringPetals) * TAU,
            inner,
            len,
            half,
            rgb,
            rgbDark,
            flutterP: rng() * TAU,
          });
        }
      }

      lotuses.push({
        hx,
        hy,
        petals,
        reach,
        swayAmp: range(SWAY_AMP),
        swayW: range(SWAY_W),
        swayP: rng() * TAU,
        bobAmp,
        bobW: range(BOB_W),
        bobP: rng() * TAU,
        clickT: Infinity,
        held: false,
      });
      break;
    }
  }
  return lotuses;
}

interface Band {
  lotuses: Lotus[];
  lastSeen: number; // frame counter; off-window bands are evicted
}

// Figure-side helpers: lay out a single bloom without a per-band rng. Used by
// blog figures (flatVsToon, etc.) that need a deterministic petal arrangement
// matching the production placeBandLotuses geometry — mid-range len/half, no
// hue/sway/bob/flutter jitter (no rng).

export function lotusPetalCount(rings: number): number {
  let n = 0;
  for (let j = rings - 1; j >= 0; j--) {
    const fr = rings === 1 ? 0 : j / (rings - 1);
    n += Math.round(PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr);
  }
  return n;
}

export function lotusReach(size: number, rings: number): number {
  const maxInner = INNER_START + RING_STEP * (rings - 1);
  return size * (maxInner + LEN_FRAC[1]);
}

export function buildSingleLotusInstances(
  out: Float32Array,
  x: number,
  y: number,
  size: number,
  _t: number,
  opts: { rings: number; baseAngle: number },
): { count: number } {
  const { rings, baseAngle } = opts;
  const lenMid = (LEN_FRAC[0] + LEN_FRAC[1]) * 0.5;
  const halfMid = (HALF_FRAC[0] + HALF_FRAC[1]) * 0.5;
  let o = 0;
  let count = 0;
  for (let j = rings - 1; j >= 0; j--) {
    const fr = rings === 1 ? 0 : j / (rings - 1);
    const inner = size * (INNER_START + RING_STEP * j);
    const len = size * lenMid;
    const half = size * halfMid;
    const ringPetals = Math.round(
      PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr,
    );
    const sat = CENTER_SL[0] + (EDGE_SL[0] - CENTER_SL[0]) * fr;
    const light = CENTER_SL[1] + (EDGE_SL[1] - CENTER_SL[1]) * fr;
    const c = hslToRgb(PINK_HUE, sat, light);
    const satD =
      DARK_CENTER_SL[0] + (DARK_EDGE_SL[0] - DARK_CENTER_SL[0]) * fr;
    const lightD =
      DARK_CENTER_SL[1] + (DARK_EDGE_SL[1] - DARK_CENTER_SL[1]) * fr;
    const cD = hslToRgb(BLUE_HUE, satD, lightD);
    const ringOffset = baseAngle + (j % 2) * (Math.PI / ringPetals);
    for (let k = 0; k < ringPetals; k++) {
      const angle = ringOffset + (k / ringPetals) * TAU;
      out[o++] = x;
      out[o++] = y;
      out[o++] = angle;
      out[o++] = len;
      out[o++] = half;
      out[o++] = inner;
      out[o++] = c[0];
      out[o++] = c[1];
      out[o++] = c[2];
      out[o++] = cD[0];
      out[o++] = cD[1];
      out[o++] = cD[2];
      // Deterministic per-petal noise seed (used by the shader for subtle
      // per-petal variation). Stable across renders.
      out[o++] = (j * 7 + k * 3) * 0.317;
      count++;
    }
  }
  return { count };
}

export class Lotuses {
  private bands = new Map<number, Band>();
  private t = 0;
  private scratch = new Float32Array(0); // grow-only, sim-owned
  private frame = 0;

  constructor(
    private seed: number,
    private width: number,
    private screenScale: number,
  ) {}

  // Viewport width/scale truly changed: drop the cache so bands regenerate at
  // the new metrics (deterministic — the same metrics reproduce the field).
  reconfigure(width: number, screenScale: number): void {
    this.width = width;
    this.screenScale = screenScale;
    this.bands.clear();
  }

  // Ensure bands covering [worldY, worldY+innerH] (± margin) exist; evict
  // off-window bands unless one still holds a poked/animating bloom. Call once
  // per frame before resolve/buildInstances.
  update(worldY: number, innerH: number): void {
    this.frame++;
    const lo = Math.max(0, Math.floor(worldY / BAND_H) - BAND_MARGIN);
    const hi = Math.floor((worldY + innerH) / BAND_H) + BAND_MARGIN;
    for (let b = lo; b <= hi; b++) {
      const band = this.bands.get(b);
      if (band) {
        band.lastSeen = this.frame;
        continue;
      }
      const r = mulberry32(hash2(this.seed ^ BAND_SEED_SALT, b));
      const count = BAND_LOTUS_MIN + ((r() * BAND_LOTUS_SPAN) | 0);
      this.bands.set(b, {
        lotuses: placeBandLotuses(
          r,
          count,
          this.width,
          b * BAND_H,
          BAND_H,
          this.screenScale,
        ),
        lastSeen: this.frame,
      });
    }
    for (const [b, band] of this.bands) {
      if (band.lastSeen === this.frame) continue;
      const busy = band.lotuses.some((L) => L.held || L.clickT < CLICK_RELEASE);
      if (!busy) this.bands.delete(b);
    }
  }

  resolve(dt: number): void {
    this.t += dt;
    for (const band of this.bands.values())
      for (const L of band.lotuses) {
        if (L.held) L.clickT = Math.min(L.clickT + dt, CLICK_ATTACK);
        else if (L.clickT < CLICK_RELEASE) {
          L.clickT += dt;
          if (L.clickT >= CLICK_RELEASE) L.clickT = Infinity;
        }
      }
  }

  // Pointer released: any held bloom springs back from its peak size.
  release(): void {
    for (const band of this.bands.values())
      for (const L of band.lotuses)
        if (L.held) {
          L.held = false;
          L.clickT = 0;
        }
  }

  // x,y in world space (same frame as hx/hy). Pokes the nearest bloom under
  // the point: holds it at peak size until release() and returns its live
  // pose (centre + the footprint radius its steady ripple uses), or null.
  poke(x: number, y: number): PokeHit | null {
    const t = this.t;
    let best: Lotus | null = null;
    let bestD = Infinity;
    let br = 0;
    for (const band of this.bands.values())
      for (const L of band.lotuses) {
        const scale = 1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP);
        const d = Math.hypot(x - L.hx, y - L.hy);
        if (d <= L.reach * scale && d < bestD) {
          best = L;
          bestD = d;
          br = L.reach * scale * RIPPLE_RADIUS_FRAC;
        }
      }
    if (!best) return null;
    best.clickT = 0;
    best.held = true;
    return { x: best.hx, y: best.hy, r: br };
  }

  buildInstances(): { data: Float32Array; count: number } {
    let count = 0;
    for (const band of this.bands.values())
      for (const L of band.lotuses) count += L.petals.length;
    const need = count * LOTUS_INST_FLOATS;
    if (need > this.scratch.length)
      this.scratch = new Float32Array(Math.ceil(need * 1.5));
    const t = this.t;
    const out = this.scratch;
    let o = 0;
    for (const band of this.bands.values())
      for (const L of band.lotuses) {
        const sway = L.swayAmp * Math.sin(t * L.swayW + L.swayP);
        const scale =
          (1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP)) *
          (1 + clickScale(L.clickT, L.held));
        for (const p of L.petals) {
          const flutter = FLUTTER_AMP * Math.sin(t * FLUTTER_W + p.flutterP);
          out[o++] = L.hx;
          out[o++] = L.hy;
          out[o++] = p.baseAngle + sway + flutter;
          out[o++] = p.len * scale;
          out[o++] = p.half * scale;
          out[o++] = p.inner * scale;
          out[o++] = p.rgb[0];
          out[o++] = p.rgb[1];
          out[o++] = p.rgb[2];
          out[o++] = p.rgbDark[0];
          out[o++] = p.rgbDark[1];
          out[o++] = p.rgbDark[2];
          out[o++] = p.flutterP;
        }
      }
    return { data: out, count };
  }

  // notch=0 makes the shader's sdRippleSource collapse to a plain disk so the
  // rings stay concentric. `worldY` lifts world -> screen space; blooms whose
  // rim falls outside [0, height] are skipped so off-screen margin bands don't
  // consume the renderer's ripple cap.
  emitRipples(sink: RippleSink, worldY: number, height: number): void {
    const t = this.t;
    for (const band of this.bands.values())
      for (const L of band.lotuses) {
        const scale = 1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP);
        const r = L.reach * scale * RIPPLE_RADIUS_FRAC;
        const cy = L.hy - worldY;
        if (cy + r < 0 || cy - r > height) continue;
        sink.addRipple(L.hx, cy, r, 0, 0, 1, true, L.swayP);
      }
  }
}
