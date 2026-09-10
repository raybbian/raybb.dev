import { hslToRgb } from "@/sim/koiPattern";
import {
  CLICK_ATTACK,
  CLICK_RELEASE,
  clickScale,
  mulberry32,
  hash2,
} from "@/lib/math";

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

// The pond is infinite in Y. World-Y is partitioned into fixed bands; each
// band's pads are a pure function of (seed, band index) so scrolling away and
// back reproduces them exactly. Bands stream in/out around the viewport.
const BAND_H = 900; // world px per band (> max raft spill, < ~3 per viewport)
const BAND_MARGIN = 2; // bands kept beyond the visible window each side
// Per-band pad count, drawn FIRST from the band RNG so it can change without
// shifting the placement stream. Mean ~7 over [4,10].
const BAND_PADS_MIN = 4;
const BAND_PADS_SPAN = 7; // count = MIN + (rng()*SPAN | 0) -> [4,10]

// Places one band's pads. Raft centres' Y lands in [bandTop, bandTop+bandH];
// rafts may Gaussian-spill into neighbours. Rejection is band-local — bands
// are independent by design, so the field stays deterministic per band.
function placeBandPads(
  rng: () => number,
  count: number,
  width: number,
  bandTop: number,
  bandH: number,
  worldScale: number,
): Pad[] {
  const pads: Pad[] = [];
  const lerp = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const range = ([lo, hi]: [number, number]) => lerp(lo, hi);
  // Box-Muller normal, clamped so a raft doesn't sprout strays.
  const gauss = () => {
    const m = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng());
    return Math.max(-RAFT_SIGMA_CLAMP, Math.min(RAFT_SIGMA_CLAMP, m));
  };
  const raftCount = Math.round(lerp(RAFTS[0], RAFTS[1]));
  const rafts = Array.from({ length: raftCount }, () => {
    const edge = rng() < 0.5 ? -1 : 1;
    return {
      cx: width * (PLACE_CENTER + edge * range(PLACE_X_OFFSET)),
      cy: bandTop + range(PLACE_Y) * bandH,
      spread: range(RAFT_SPREAD) * worldScale,
    };
  });
  for (let i = 0; i < count; i++) {
    const raft = rafts[(rng() * raftCount) | 0];
    // Reject candidates whose footprint (peak bob + full drift travel) would
    // touch an existing pad, so pads never overlap even at motion extremes.
    for (let attempt = 0; attempt < MAX_PLACE_ATTEMPTS; attempt++) {
      const hx = raft.cx + gauss() * raft.spread;
      const hy = raft.cy + gauss() * raft.spread;
      const radius = range(RADIUS) * worldScale;
      const driftAmp = range(DRIFT_AMP) * worldScale;
      const bobAmp = range(BOB_AMP);
      const reach = radius * (1 + bobAmp) + driftAmp;
      const clear = pads.every((q) => {
        const dx = q.hx - hx;
        const dy = q.hy - hy;
        return Math.hypot(dx, dy) >= reach + q.reach + PAD_GAP * worldScale;
      });
      if (!clear) continue;
      pads.push({
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
  return pads;
}

interface Band {
  pads: Pad[];
  lastSeen: number; // frame counter; off-window bands are evicted
}

export class Lilypads {
  private bands = new Map<number, Band>();
  private t = 0;
  private scratch = new Float32Array(0); // grow-only, sim-owned
  private frame = 0;

  constructor(
    private seed: number,
    private width: number,
    private worldScale: number,
  ) {}

  // Viewport width/scale truly changed: drop the cache so bands regenerate at
  // the new metrics (deterministic — the same metrics reproduce the field).
  reconfigure(width: number, worldScale: number): void {
    this.width = width;
    this.worldScale = worldScale;
    this.bands.clear();
  }

  // Ensure bands covering [worldY, worldY+innerH] (± margin) exist; evict
  // off-window bands unless one still holds a poked/animating pad (so a held
  // pad can't vanish mid-drag). Call once per frame before resolve/build.
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
      const r = mulberry32(hash2(this.seed, b));
      const count = BAND_PADS_MIN + ((r() * BAND_PADS_SPAN) | 0);
      this.bands.set(b, {
        pads: placeBandPads(
          r,
          count,
          this.width,
          b * BAND_H,
          BAND_H,
          this.worldScale,
        ),
        lastSeen: this.frame,
      });
    }
    for (const [b, band] of this.bands) {
      if (band.lastSeen === this.frame) continue;
      const busy = band.pads.some((p) => p.held || p.clickT < CLICK_RELEASE);
      if (!busy) this.bands.delete(b);
    }
  }

  resolve(dt: number): void {
    this.t += dt;
    for (const band of this.bands.values())
      for (const p of band.pads) {
        if (p.held) p.clickT = Math.min(p.clickT + dt, CLICK_ATTACK);
        else if (p.clickT < CLICK_RELEASE) {
          p.clickT += dt;
          if (p.clickT >= CLICK_RELEASE) p.clickT = Infinity;
        }
      }
  }

  // Pointer released: any held pad springs back from its peak size.
  release(): void {
    for (const band of this.bands.values())
      for (const p of band.pads)
        if (p.held) {
          p.held = false;
          p.clickT = 0;
        }
  }

  // x,y in world space (same frame as hx/hy). Pokes the nearest pad under the
  // point: holds it at peak size until release() and returns its live pose
  // (for the caller to spawn a ripple), or null if the point missed.
  poke(x: number, y: number): PokeHit | null {
    const t = this.t;
    let best: Pad | null = null;
    let bestD = Infinity;
    let bx = 0;
    let by = 0;
    let br = 0;
    for (const band of this.bands.values())
      for (const p of band.pads) {
        const cx = p.hx + p.driftAmp * Math.cos(t * p.wx + p.px);
        const cy = p.hy + p.driftAmp * Math.sin(t * p.wy + p.py);
        const radius =
          p.radius * (1 + p.bobAmp * Math.sin(t * p.bobW + p.bobP));
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
    let count = 0;
    for (const band of this.bands.values()) count += band.pads.length;
    const need = count * LILYPAD_INST_FLOATS;
    if (need > this.scratch.length)
      this.scratch = new Float32Array(Math.ceil(need * 1.5));
    const t = this.t;
    const out = this.scratch;
    let o = 0;
    for (const band of this.bands.values())
      for (const p of band.pads) {
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
    return { data: out, count };
  }
}
