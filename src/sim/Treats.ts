import type { RippleSink } from "@/render/WaterRenderer";

export const TREAT_INST_FLOATS = 7; // cx, cy, radius, depth, r, g, b

const SPLASH_DUR = 0.55; // s of surface splash before it starts sinking
const SINK_DUR = 5; // s to descend from shallow to deep
const DEPTH_SHALLOW = 0.06; // submergence during/just after the splash
const DEPTH_DEEP = 0.85; // resting submergence once fully sunk
const RIPPLE_MAX_PX = 70; // px (pre-scale) the splash ring grows to
const TREAT_BASE_R = 9; // px (pre-scale) of the drawn morsel
const EAT_EXTRA = 26; // px added to the radius for the eat test
const MAX_TREATS = 12; // oldest dropped past this
const RIPPLE_PEAK = 0.18; // fraction of SPLASH_DUR where amp peaks
const TAN: [number, number, number] = [0.8, 0.66, 0.42];

export interface Treat {
  x: number;
  y: number; // scene-space (same space the fish swim in)
  t: number; // age, seconds
  eaten: boolean; // kept alive only to finish its splash
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Treats {
  private items: Treat[] = [];
  private radius: number; // drawn morsel radius, px
  private _eatRadius: number; // eat-test radius, px
  private rippleMaxR: number; // final splash-ring radius, px
  private scratch = new Float32Array(MAX_TREATS * TREAT_INST_FLOATS);

  constructor(screenScale = 1) {
    this.radius = TREAT_BASE_R * screenScale;
    // Scale the eat margin with the morsel, not after it.
    this._eatRadius = (TREAT_BASE_R + EAT_EXTRA) * screenScale;
    this.rippleMaxR = RIPPLE_MAX_PX * screenScale * 0.75; // final radius x0.75
  }

  get eatRadius(): number {
    return this._eatRadius;
  }

  spawn(x: number, y: number): void {
    if (this.items.length >= MAX_TREATS) this.items.shift();
    this.items.push({ x, y, t: 0, eaten: false });
  }

  resolve(dt: number): void {
    for (const it of this.items) it.t += dt;
    // Drop once spent: eaten treats linger only to finish their splash.
    this.items = this.items.filter((it) => !(it.eaten && it.t >= SPLASH_DUR));
  }

  eat(treat: Treat): void {
    treat.eaten = true;
  }

  // Steering targets: eaten treats excluded so fish lose interest at once.
  list(): Treat[] {
    return this.items.filter((it) => !it.eaten);
  }

  private depthOf(it: Treat): number {
    if (it.t <= SPLASH_DUR) return DEPTH_SHALLOW;
    const k = clamp01((it.t - SPLASH_DUR) / SINK_DUR);
    return DEPTH_SHALLOW + (DEPTH_DEEP - DEPTH_SHALLOW) * k;
  }

  // The radius eases out from ~0 so the ring reads as originating at the
  // impact point rather than spawning full-size; amp ramps fast then fades.
  emitRipples(sink: RippleSink, scroll: number): void {
    for (const it of this.items) {
      if (it.t >= SPLASH_DUR) continue;
      const p = it.t / SPLASH_DUR; // 0..1 over the splash
      const r = this.rippleMaxR * (1 - (1 - p) * (1 - p)); // ease-out grow
      const amp =
        p < RIPPLE_PEAK
          ? p / RIPPLE_PEAK
          : 1 - (p - RIPPLE_PEAK) / (1 - RIPPLE_PEAK);
      sink.addRipple(
        it.x,
        it.y - scroll,
        r,
        0,
        0,
        Math.max(0, amp),
        false,
        it.x, // stable per-treat (x is fixed while it sinks)
      );
    }
  }

  renderInstances(): { data: Float32Array; count: number } {
    const out = this.scratch;
    let o = 0;
    let count = 0;
    for (const it of this.items) {
      if (it.eaten) continue; // morsel gone, ripple stays
      out[o++] = it.x;
      out[o++] = it.y;
      out[o++] = this.radius;
      out[o++] = this.depthOf(it);
      out[o++] = TAN[0];
      out[o++] = TAN[1];
      out[o++] = TAN[2];
      count++;
    }
    return { data: out, count };
  }
}
