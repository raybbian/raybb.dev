import { hslToRgb } from "@/sim/koiPattern";
import { CLICK_ATTACK, CLICK_RELEASE, clickScale } from "@/lib/math";

// Live pose of a poked surface object: scene-space centre + current radius.
export interface PokeHit {
  x: number;
  y: number;
  r: number;
}

// Home stays fixed; the live pose is derived from `t` (drift/spin/bob).
interface Pad {
  hx: number;
  hy: number;
  radius: number;
  rgb: [number, number, number];
  angle: number; // base notch/star orientation
  notchHalf: number; // half-width of the V-notch, radians
  seed: number; // star spoke phase
  driftAmp: number;
  wx: number;
  wy: number;
  px: number;
  py: number;
  spin: number;
  bobAmp: number;
  bobW: number;
  bobP: number;
  reach: number; // worst-case footprint radius (peak bob + full drift), px
  clickT: number; // s into the current click phase; Infinity == idle
  held: boolean; // pointer still down on this pad -> hold at peak size
}

export const LILYPAD_INST_FLOATS = 9; // cx,cy,radius,rot,notchHalf,seed,r,g,b

// Ranges are [lo, hi], sampled per pad via the seeded rng.
const TAU = Math.PI * 2;
// Placement biased away from screen center so the koi stays readable.
const PLACE_CENTER = 0.5; // viewport-fraction anchor (x)
const PLACE_X_OFFSET: [number, number] = [0.12, 0.46]; // |x - center| range
const PLACE_Y: [number, number] = [0.06, 0.94]; // y as viewport fraction
const RADIUS: [number, number] = [36, 90]; // px
// Pad green in HSL.
const PAD_HUE: [number, number] = [0.22, 0.42];
const PAD_SAT: [number, number] = [0.35, 0.6];
const PAD_LIGHT: [number, number] = [0.28, 0.45];
const NOTCH_HALF: [number, number] = [0.12, 0.22]; // V-notch half-width, rad
const DRIFT_AMP: [number, number] = [6, 16]; // px
const DRIFT_W: [number, number] = [0.08, 0.18]; // rad/s
const SPIN: [number, number] = [-0.06, 0.06]; // rad/s
const BOB_AMP: [number, number] = [0.02, 0.05]; // fraction of radius
const BOB_W: [number, number] = [0.5, 1.1]; // rad/s
const MAX_PLACE_ATTEMPTS = 40;
const PAD_GAP = 6; // min clear water between pad footprints, px
// Pads grow in rafts (vegetative spread from a rhizome), not evenly scattered.
const RAFTS: [number, number] = [3, 6]; // clump count (rounded to an int)
const RAFT_SPREAD: [number, number] = [55, 130]; // per-raft radial sigma, px
const RAFT_SIGMA_CLAMP = 2.4; // cap pad offset at N sigma so rafts stay cohesive

export class Lilypads {
  private pads: Pad[] = [];
  private t = 0;
  private scratch!: Float32Array; // reused instance buffer (sim owns it)

  constructor(
    rng: () => number,
    count: number,
    width: number,
    height: number,
    screenScale = 1,
  ) {
    const lerp = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const range = ([lo, hi]: [number, number]) => lerp(lo, hi);
    // Box-Muller normal, clamped so a raft doesn't sprout strays.
    const gauss = () => {
      const m =
        Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());
      return Math.max(-RAFT_SIGMA_CLAMP, Math.min(RAFT_SIGMA_CLAMP, m));
    };
    const raftCount = Math.round(lerp(RAFTS[0], RAFTS[1]));
    const rafts = Array.from({ length: raftCount }, () => {
      const edge = rng() < 0.5 ? -1 : 1;
      return {
        cx: width * (PLACE_CENTER + edge * range(PLACE_X_OFFSET)),
        cy: range(PLACE_Y) * height,
        spread: range(RAFT_SPREAD) * screenScale,
      };
    });
    for (let i = 0; i < count; i++) {
      const raft = rafts[(rng() * raftCount) | 0];
      // Reject candidates whose footprint (peak bob + full drift travel) would
      // touch an existing pad, so pads never overlap even at motion extremes.
      for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
        const hx = raft.cx + gauss() * raft.spread;
        const hy = raft.cy + gauss() * raft.spread;
        const radius = range(RADIUS) * screenScale;
        const driftAmp = range(DRIFT_AMP) * screenScale;
        const bobAmp = range(BOB_AMP);
        const reach = radius * (1 + bobAmp) + driftAmp;
        const clear = this.pads.every((q) => {
          const dx = q.hx - hx;
          const dy = q.hy - hy;
          return Math.hypot(dx, dy) >= reach + q.reach + PAD_GAP * screenScale;
        });
        if (!clear) continue;
        this.pads.push({
          hx,
          hy,
          radius,
          reach,
          rgb: hslToRgb(range(PAD_HUE), range(PAD_SAT), range(PAD_LIGHT))
            .slice(0, 3) as [number, number, number],
          angle: rng() * TAU,
          notchHalf: range(NOTCH_HALF),
          seed: rng() * TAU,
          driftAmp,
          wx: range(DRIFT_W),
          wy: range(DRIFT_W),
          px: rng() * TAU,
          py: rng() * TAU,
          spin: range(SPIN),
          bobAmp,
          bobW: range(BOB_W),
          bobP: rng() * TAU,
          clickT: Infinity,
          held: false,
        });
        break;
      }
    }
    this.scratch = new Float32Array(this.pads.length * LILYPAD_INST_FLOATS);
  }

  resolve(dt: number): void {
    this.t += dt;
    for (const p of this.pads) {
      if (p.held) p.clickT = Math.min(p.clickT + dt, CLICK_ATTACK);
      else if (p.clickT < CLICK_RELEASE) {
        p.clickT += dt;
        if (p.clickT >= CLICK_RELEASE) p.clickT = Infinity;
      }
    }
  }

  // Pointer released: any held pad springs back from its peak size.
  release(): void {
    for (const p of this.pads)
      if (p.held) {
        p.held = false;
        p.clickT = 0;
      }
  }

  // x,y in scene space (same frame as hx/hy). Pokes the nearest pad under the
  // point: holds it at peak size until release() and returns its live pose
  // (for the caller to spawn a ripple), or null if the point missed.
  poke(x: number, y: number): PokeHit | null {
    const t = this.t;
    let best: Pad | null = null;
    let bestD = Infinity;
    let bx = 0;
    let by = 0;
    let br = 0;
    for (const p of this.pads) {
      const cx = p.hx + p.driftAmp * Math.cos(t * p.wx + p.px);
      const cy = p.hy + p.driftAmp * Math.sin(t * p.wy + p.py);
      const radius = p.radius * (1 + p.bobAmp * Math.sin(t * p.bobW + p.bobP));
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && d < bestD) {
        best = p;
        bestD = d;
        bx = cx;
        by = cy;
        br = radius;
      }
    }
    if (!best) return null;
    best.clickT = 0;
    best.held = true;
    return { x: bx, y: by, r: br };
  }

  buildInstances(): { data: Float32Array; count: number } {
    const t = this.t;
    const out = this.scratch;
    let o = 0;
    for (const p of this.pads) {
      const cx = p.hx + p.driftAmp * Math.cos(t * p.wx + p.px);
      const cy = p.hy + p.driftAmp * Math.sin(t * p.wy + p.py);
      const rot = p.angle + p.spin * t;
      const radius =
        p.radius *
        (1 + p.bobAmp * Math.sin(t * p.bobW + p.bobP)) *
        (1 + clickScale(p.clickT, p.held));
      out[o++] = cx;
      out[o++] = cy;
      out[o++] = radius;
      out[o++] = rot;
      out[o++] = p.notchHalf;
      out[o++] = p.seed;
      out[o++] = p.rgb[0];
      out[o++] = p.rgb[1];
      out[o++] = p.rgb[2];
    }
    return { data: out, count: this.pads.length };
  }
}
