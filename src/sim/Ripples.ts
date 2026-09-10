import type { RippleSink } from "@/render/WaterRenderer";

// Transient circular rings spawned when a lilypad/lotus is poked. Each poke
// pushes an independent ring, so rapid clicks stack instead of one resetting
// the next. No static foam collar (foam=false) -> reads as a single ring.
const RIPPLE_DUR = 0.7; // s a ring lives
const RIPPLE_SPREAD = 80; // px (pre-scale) the ring grows past its source
const RIPPLE_PEAK = 0.18; // fraction of RIPPLE_DUR where amp peaks
const RADIUS_SCALE = 0.75; // shrink the whole ring (final radius x0.75)
const MAX_RINGS = 24; // oldest dropped past this (keeps the ripple budget sane)

interface Ring {
  x: number;
  y: number; // scene-space (same space pads/lotuses live in)
  r0: number; // source radius at spawn, px
  t: number; // age, s
}

export class Ripples {
  private rings: Ring[] = [];
  private spread: number;

  constructor(worldScale = 1) {
    this.spread = RIPPLE_SPREAD * worldScale;
  }

  spawn(x: number, y: number, baseR: number): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, r0: baseR, t: 0 });
  }

  resolve(dt: number): void {
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < RIPPLE_DUR);
  }

  // Circular, foam-less; radius eases out from the source, amp ramps then fades.
  emitRipples(sink: RippleSink, scroll: number): void {
    for (const ring of this.rings) {
      const p = ring.t / RIPPLE_DUR;
      const r =
        (ring.r0 + this.spread * (1 - (1 - p) * (1 - p))) * RADIUS_SCALE;
      const amp =
        p < RIPPLE_PEAK
          ? p / RIPPLE_PEAK
          : 1 - (p - RIPPLE_PEAK) / (1 - RIPPLE_PEAK);
      sink.addRipple(
        ring.x,
        ring.y - scroll,
        r,
        0,
        0,
        Math.max(0, amp),
        false,
        ring.x + ring.y, // stable per-ring (spawn pos is constant)
      );
    }
  }
}
