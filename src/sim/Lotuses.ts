import { hslToRgb } from "@/sim/koiPattern";
import type { RippleSink } from "@/render/WaterRenderer";

// One petal instance: cx,cy = lotus centre; angle = outward facing direction
// (base orientation + sway + flutter, radians); len/half = petal size; inner =
// radial offset of the petal root from the centre; rgb = tint; seed = per-petal
// noise phase for the fragment shader.
export const LOTUS_INST_FLOATS = 10;

// A precomputed petal slot. Only `angle` (sway/flutter) and the size scale
// change per frame; everything else is fixed at construction.
interface Petal {
  baseAngle: number; // outward direction at rest, rad
  inner: number; // root distance from centre, px
  len: number; // root -> tip length, px
  half: number; // half-width at the base, px
  rgb: [number, number, number];
  flutterP: number; // per-petal flutter phase
}

// One lotus: a fixed home position, a precomputed ring of petals, and seeded
// sway/bob parameters. The live pose is derived from `t` like the lilypads.
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
}

// ===========================================================================
// Tunable constants. Ranges are [lo, hi], sampled per lotus via the seeded rng.
// ===========================================================================
const TAU = Math.PI * 2;
// Placement: biased away from screen centre so the koi stays readable (mirrors
// the lilypad placement bias).
const PLACE_CENTER = 0.5;
const PLACE_X_OFFSET: [number, number] = [0.1, 0.46];
const PLACE_Y: [number, number] = [0.06, 0.94];
const SIZE: [number, number] = [30, 49]; // overall lotus scale, px (0.66x)
const RING_COUNT: [number, number] = [3, 4]; // concentric petal rings
// Per-ring radial layout as a fraction of SIZE. Ring roots step out by a
// FIXED amount per ring, so a 3-ring lotus is a smaller, tighter bloom than a
// 4-ring one and the petals always overlap (no gaps regardless of ringCount).
const INNER_START = 0.08; // innermost ring petal-root distance
const RING_STEP = 0.17; // radial gap between consecutive rings
const LEN_FRAC: [number, number] = [0.48, 0.58]; // petal length
const HALF_FRAC: [number, number] = [0.27, 0.34]; // petal half-width
const PETALS_INNER = 5; // petals in the innermost ring
const PETALS_OUTER = 10; // petals in the outermost ring
// Pink centre -> white outer petals. Hue ~ magenta-pink; the centre rings are
// saturated pink, the outer rings open up toward white.
const PINK_HUE = 0.95;
const HUE_JITTER: [number, number] = [-0.03, 0.03]; // per-lotus hue shift
const CENTER_SL: [number, number] = [0.72, 0.74]; // [sat, light] at the centre
const EDGE_SL: [number, number] = [0.06, 0.97]; // [sat, light] at the outer edge
// Gentle sway (whole-flower rotation) + scale bob + tiny per-petal flutter.
const SWAY_AMP: [number, number] = [0.04, 0.1]; // rad
const SWAY_W: [number, number] = [0.25, 0.55]; // rad/s
const BOB_AMP: [number, number] = [0.015, 0.035]; // fraction of size
const BOB_W: [number, number] = [0.4, 0.9]; // rad/s
const FLUTTER_AMP = 0.025; // per-petal angular flutter, rad
const FLUTTER_W = 1.6; // per-petal flutter rate, rad/s
const MAX_PLACE_ATTEMPTS = 40;
const LOTUS_GAP = 10; // min clear water between lotus footprints, px
// Ripple/foam radius as a fraction of the petal-tip reach. <1 pulls the
// static foam collar inside the bloom so it overlaps the petals instead of
// leaving a ring of clean water around them.
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
      // Reject candidates whose footprint (peak bob scale) touches an already-
      // placed lotus, so flowers never visually overlap. Lilypads are ignored
      // by design — a lotus may sit over a pad and draws on top of it.
      for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
        const edge = rng() < 0.5 ? -1 : 1;
        const hx = width * (PLACE_CENTER + edge * range(PLACE_X_OFFSET));
        const hy = range(PLACE_Y) * height;
        const size = range(SIZE) * screenScale;
        const bobAmp = range(BOB_AMP);
        const ringCount = Math.round(range(RING_COUNT));
        // Footprint = the outermost ring's petal tip (its root + length). The
        // outer root depends on ringCount, so fewer rings -> smaller footprint.
        const maxInner = INNER_START + RING_STEP * (ringCount - 1);
        const reach = size * (maxInner + LEN_FRAC[1]) * (1 + bobAmp);
        const clear = this.lotuses.every((q) => {
          const dx = q.hx - hx;
          const dy = q.hy - hy;
          return Math.hypot(dx, dy) >= reach + q.reach + LOTUS_GAP;
        });
        if (!clear) continue;

        const baseAngle = rng() * TAU;
        const hueJitter = range(HUE_JITTER);
        // Emit rings outermost -> innermost. With alpha blending and no depth
        // test, draw order is paint order: the inner rings come last so they
        // sit on top, giving the concentric, centre-on-top bloom.
        const petals: Petal[] = [];
        for (let j = ringCount - 1; j >= 0; j--) {
          const fr = ringCount === 1 ? 0 : j / (ringCount - 1);
          // Fixed step per ring -> consistent overlap; fewer rings == smaller.
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
          // Interleave alternate rings by half a step so petals nest into the
          // gaps of the ring beneath for a full, layered bloom.
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
        });
        this.petalTotal += petals.length;
        break;
      }
    }
    this.scratch = new Float32Array(this.petalTotal * LOTUS_INST_FLOATS);
  }

  resolve(dt: number): void {
    this.t += dt;
  }

  // Live petal instances for the renderer. The petal count is fixed; only the
  // pose (sway rotation + flutter + scale bob) varies per frame.
  buildInstances(): { data: Float32Array; count: number } {
    const t = this.t;
    const out = this.scratch;
    let o = 0;
    for (const L of this.lotuses) {
      const sway = L.swayAmp * Math.sin(t * L.swayW + L.swayP);
      const scale = 1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP);
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

  // One ripple source per lotus, written straight into the water pass's sink
  // (no array): cx, cy-scroll, radius, rot=0, notch=0, amp=1. notch = 0 makes
  // the shader's sdRippleSource collapse to a plain disk so the rings stay
  // concentric around the flower. `scroll` lifts scene -> screen space.
  emitRipples(sink: RippleSink, scroll: number): void {
    const t = this.t;
    for (const L of this.lotuses) {
      const scale = 1 + L.bobAmp * Math.sin(t * L.bobW + L.bobP);
      sink.addRipple(
        L.hx, L.hy - scroll, L.reach * scale * RIPPLE_RADIUS_FRAC, 0, 0, 1,
      );
    }
  }
}
