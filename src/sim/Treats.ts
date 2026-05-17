import type { RippleSink } from "@/render/WaterRenderer";

// A clicked treat: a small tan morsel that splashes the surface (a ripple
// that grows from the impact point, then fades) and afterwards sinks in
// place — its submergence ramps up so the water pass tints it bluer, exactly
// like a fish. It lives until a fish reaches it.

export const TREAT_INST_FLOATS = 7; // cx, cy, radius, depth, r, g, b

const SPLASH_DUR = 0.55; // s of surface splash before it starts sinking
const SINK_DUR = 5; // s to descend from shallow to deep
const DEPTH_SHALLOW = 0.06; // submergence during/just after the splash
const DEPTH_DEEP = 0.85; // resting submergence once fully sunk
const RIPPLE_MAX_PX = 70; // px (pre-scale) the splash ring grows to
const TREAT_BASE_R = 9; // px (pre-scale) of the drawn morsel
const EAT_EXTRA = 26; // px added to the radius for the eat test
const MAX_TREATS = 12; // cap; oldest is dropped past this
const RIPPLE_PEAK = 0.18; // fraction of SPLASH_DUR where amp peaks
const TAN: [number, number, number] = [0.8, 0.66, 0.42];

export interface Treat {
  x: number;
  y: number; // scene-space (same space the fish swim in)
  t: number; // age, seconds
  eaten: boolean; // a fish reached it; kept alive only to finish its splash
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Treats {
  private items: Treat[] = [];
  private radius: number; // drawn morsel radius, px
  private rippleMaxR: number; // final splash-ring radius, px
  private scratch = new Float32Array(MAX_TREATS * TREAT_INST_FLOATS);

  constructor(screenScale = 1) {
    this.radius = TREAT_BASE_R * screenScale;
    this.rippleMaxR = RIPPLE_MAX_PX * screenScale;
  }

  // Distance under which a fish head is considered to have eaten a treat.
  get eatRadius(): number {
    return this.radius + EAT_EXTRA;
  }

  spawn(x: number, y: number): void {
    if (this.items.length >= MAX_TREATS) this.items.shift();
    this.items.push({ x, y, t: 0, eaten: false });
  }

  resolve(dt: number): void {
    for (const it of this.items) it.t += dt;
    // An eaten treat lingers only long enough for its splash ripple to play
    // out; once the splash is done it (or any already-spent one) is dropped.
    this.items = this.items.filter((it) => !(it.eaten && it.t >= SPLASH_DUR));
  }

  // Mark a treat as eaten. Its morsel and pull on the fish vanish at once, but
  // a treat still mid-splash stays in the sim so its ripple finishes (pruned
  // in resolve()); one eaten after the splash is already gone.
  eat(treat: Treat): void {
    treat.eaten = true;
  }

  // Live scene-space targets for fish steering + collision handles. Eaten
  // treats are excluded so the fish lose interest the instant one is taken.
  list(): Treat[] {
    return this.items.filter((it) => !it.eaten);
  }

  private depthOf(it: Treat): number {
    if (it.t <= SPLASH_DUR) return DEPTH_SHALLOW;
    const k = clamp01((it.t - SPLASH_DUR) / SINK_DUR);
    return DEPTH_SHALLOW + (DEPTH_DEEP - DEPTH_SHALLOW) * k;
  }

  // Splash sources only, as 6-float groups [cx, cy - scroll, radius, rot=0,
  // notch=0, amp]. The radius eases out from ~0 so the ring reads as
  // originating at the impact point instead of spawning in full-size; amp
  // ramps up fast then fades to 0 by SPLASH_DUR so the splash dissipates.
  // Eaten treats still emit while mid-splash so the ripple plays out.
  emitRipples(sink: RippleSink, scroll: number): void {
    for (const it of this.items) {
      if (it.t >= SPLASH_DUR) continue;
      const p = it.t / SPLASH_DUR; // 0..1 over the splash
      const r = this.rippleMaxR * (1 - (1 - p) * (1 - p)); // ease-out grow
      const amp =
        p < RIPPLE_PEAK
          ? p / RIPPLE_PEAK
          : 1 - (p - RIPPLE_PEAK) / (1 - RIPPLE_PEAK);
      sink.addRipple(it.x, it.y - scroll, r, 0, 0, Math.max(0, amp));
    }
  }

  // Per-treat instances for TreatRenderer: cx, cy, radius, depth, r, g, b.
  renderInstances(): { data: Float32Array; count: number } {
    const out = this.scratch;
    let o = 0;
    let count = 0;
    for (const it of this.items) {
      if (it.eaten) continue; // the fish took it — morsel gone, ripple stays
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
