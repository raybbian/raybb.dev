import { hslToRgb } from "@/sim/koiPattern";
import { CLICK_ATTACK, CLICK_RELEASE, clickScale } from "@/lib/math";
import type { PokeHit } from "@/sim/Lilypads";
import type { RippleSink } from "@/render/WaterRenderer";

// Instance layout: cx,cy, angle, len, half, inner, r,g,b, seed (noise phase).
export const LOTUS_INST_FLOATS = 10;

// Only `angle` (sway/flutter) and the size scale vary per frame.
interface Petal {
  baseAngle: number; // outward direction at rest, rad
  inner: number; // root distance from centre, px
  len: number; // root -> tip length, px
  half: number; // half-width at the base, px
  rgb: [number, number, number];
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

export class Lotuses {
  private lotuses: Lotus[] = [];
  private t = 0;
  private scratch: Float32Array;
  private petalTotal = 0;

  constructor(
    rng: () => number,
    count: number,
    width: number,
    height: number,
    screenScale = 1,
  ) {
    const lerp = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const range = ([lo, hi]: [number, number]) => lerp(lo, hi);
    for (let i = 0; i < count; i++) {
      // Reject candidates whose footprint (peak bob) touches a placed lotus.
      // Lilypads are ignored by design — a lotus may sit over and draw on one.
      for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
        const edge = rng() < 0.5 ? -1 : 1;
        const hx = width * (PLACE_CENTER + edge * range(PLACE_X_OFFSET));
        const hy = range(PLACE_Y) * height;
        const size = range(SIZE) * screenScale;
        const bobAmp = range(BOB_AMP);
        const ringCount = Math.round(range(RING_COUNT));
        // Footprint = outermost ring's petal tip; depends on ringCount.
        const maxInner = INNER_START + RING_STEP * (ringCount - 1);
        const reach = size * (maxInner + LEN_FRAC[1]) * (1 + bobAmp);
        const clear = this.lotuses.every((q) => {
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
          const len =
            size * (LEN_FRAC[0] + (LEN_FRAC[1] - LEN_FRAC[0]) * fr);
          const half =
            size * (HALF_FRAC[0] + (HALF_FRAC[1] - HALF_FRAC[0]) * fr);
          const ringPetals = Math.round(
            PETALS_INNER + (PETALS_OUTER - PETALS_INNER) * fr,
          );
          const sat = CENTER_SL[0] + (EDGE_SL[0] - CENTER_SL[0]) * fr;
          const light = CENTER_SL[1] + (EDGE_SL[1] - CENTER_SL[1]) * fr;
          const c = hslToRgb(PINK_HUE + hueJitter, sat, light);
          const rgb: [number, number, number] = [c[0], c[1], c[2]];
          // Offset alternate rings by half a step so petals nest into the
          // gaps of the ring beneath.
          const ringOffset =
            baseAngle + (j % 2) * (Math.PI / ringPetals);
          for (let k = 0; k < ringPetals; k++) {
            petals.push({
              baseAngle: ringOffset + (k / ringPetals) * TAU,
              inner,
              len,
              half,
              rgb,
              flutterP: rng() * TAU,
            });
          }
        }

        this.lotuses.push({
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
        this.petalTotal += petals.length;
        break;
      }
    }
    this.scratch = new Float32Array(this.petalTotal * LOTUS_INST_FLOATS);
  }

  resolve(dt: number): void {
    this.t += dt;
    for (const L of this.lotuses) {
      if (L.held) L.clickT = Math.min(L.clickT + dt, CLICK_ATTACK);
      else if (L.clickT < CLICK_RELEASE) {
        L.clickT += dt;
        if (L.clickT >= CLICK_RELEASE) L.clickT = Infinity;
      }
    }
  }

  // Pointer released: any held bloom springs back from its peak size.
  release(): void {
    for (const L of this.lotuses)
      if (L.held) {
        L.held = false;
        L.clickT = 0;
      }
  }

  // x,y in scene space (same frame as hx/hy). Pokes the nearest bloom under
  // the point: holds it at peak size until release() and returns its live
  // pose (centre + the footprint radius its steady ripple uses), or null.
  poke(x: number, y: number): PokeHit | null {
    const t = this.t;
    let best: Lotus | null = null;
    let bestD = Infinity;
    let br = 0;
    for (const L of this.lotuses) {
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
    const t = this.t;
    const out = this.scratch;
    let o = 0;
    for (const L of this.lotuses) {
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
        out[o++] = p.flutterP;
      }
    }
    return { data: out, count: this.petalTotal };
  }

  // notch=0 makes the shader's sdRippleSource collapse to a plain disk so the
  // rings stay concentric. `scroll` lifts scene -> screen space.
  emitRipples(sink: RippleSink, scroll: number): void {
    const t = this.t;
    for (const L of this.lotuses) {
      const scale = 1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP);
      sink.addRipple(
        L.hx, L.hy - scroll, L.reach * scale * RIPPLE_RADIUS_FRAC,
        0, 0, 1, true,
      );
    }
  }
}
