export interface Vec2 {
  x: number;
  y: number;
}

export const TWO_PI = Math.PI * 2;

// Seeded PRNG: deterministic [0,1) stream from a 32-bit seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mixes two ints into a stable uint32 (same mixing family as mulberry32).
// Used to derive a per-cell seed: mulberry32(hash2(seed, cellIndex)).
export function hash2(seed: number, n: number): number {
  let h = (seed >>> 0) ^ Math.imul(n >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const CLICK_ATTACK = 0.12; // s to pop up to peak while pressed
export const CLICK_RELEASE = 0.5; // s to spring back after release
export const CLICK_PEAK = 0.22; // additive scale delta at full size

// Additive scale delta for a poked object. `held` (pointer still down): ease
// out to CLICK_PEAK and stay there. Released: a damped spring from the peak
// back through 0 (small undershoot, then settled). `elapsed` is seconds into
// the current phase; idle == elapsed >= CLICK_RELEASE while not held -> 0.
export function clickScale(elapsed: number, held: boolean): number {
  if (held) {
    const p = elapsed < CLICK_ATTACK ? elapsed / CLICK_ATTACK : 1;
    return CLICK_PEAK * (1 - (1 - p) * (1 - p));
  }
  if (elapsed < 0 || elapsed >= CLICK_RELEASE) return 0;
  const p = elapsed / CLICK_RELEASE;
  return CLICK_PEAK * Math.exp(-5 * p) * Math.cos(p * Math.PI * 2);
}

export function v(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function mag(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function heading(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

export function fromAngle(a: number): Vec2 {
  return { x: Math.cos(a), y: Math.sin(a) };
}

export function setMag(a: Vec2, m: number): Vec2 {
  const len = mag(a);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: (a.x / len) * m, y: (a.y / len) * m };
}

export function constrainDistance(pos: Vec2, anchor: Vec2, constraint: number): Vec2 {
  return add(anchor, setMag(sub(pos, anchor), constraint));
}

export function simplifyAngle(angle: number): number {
  while (angle >= TWO_PI) angle -= TWO_PI;
  while (angle < 0) angle += TWO_PI;
  return angle;
}

export function relativeAngleDiff(angle: number, anchor: number): number {
  angle = simplifyAngle(angle + Math.PI - anchor);
  return Math.PI - angle;
}

export function constrainAngle(angle: number, anchor: number, constraint: number): number {
  const diff = relativeAngleDiff(angle, anchor);
  if (Math.abs(diff) <= constraint) return simplifyAngle(angle);
  if (diff > constraint) return simplifyAngle(anchor - constraint);
  return simplifyAngle(anchor + constraint);
}

// Closed uniform Catmull-Rom through every point in `pts`.
export function catmullRomClosed(pts: Vec2[], segments: number): Vec2[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

// Samples in (0, 1] — excludes the start point.
export function cubicBezier(
  p0: Vec2,
  c1: Vec2,
  c2: Vec2,
  p3: Vec2,
  segments: number,
): Vec2[] {
  const out: Vec2[] = [];
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push({
      x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    });
  }
  return out;
}

// Pooled variants: same math, but mutate a caller-owned reused array in
// place instead of allocating Vec2s. The pool only grows. `out` MUST NOT
// alias `pts`.
export function poolAt(out: Vec2[], i: number): Vec2 {
  let p = out[i];
  if (p === undefined) {
    p = { x: 0, y: 0 };
    out[i] = p;
  }
  return p;
}

// `out.length` is set to the sample count so callers iterate it like the
// allocating form.
export function catmullRomClosedInto(
  pts: Vec2[],
  segments: number,
  out: Vec2[],
): Vec2[] {
  const n = pts.length;
  if (n < 3) {
    for (let i = 0; i < n; i++) {
      const o = poolAt(out, i);
      o.x = pts[i].x;
      o.y = pts[i].y;
    }
    if (out.length > n) out.length = n;
    return out;
  }
  let w = 0;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const o = poolAt(out, w++);
      o.x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      o.y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    }
  }
  if (out.length > w) out.length = w;
  return out;
}

// Appends `segments` samples into `out` at `off`; returns the next index.
export function cubicBezierAppend(
  p0: Vec2,
  c1: Vec2,
  c2: Vec2,
  p3: Vec2,
  segments: number,
  out: Vec2[],
  off: number,
): number {
  for (let s = 1; s <= segments; s++) {
    const t = s / segments;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    const o = poolAt(out, off++);
    o.x = a * p0.x + b * c1.x + c * c2.x + d * p3.x;
    o.y = a * p0.y + b * c1.y + c * c2.y + d * p3.y;
  }
  return off;
}
