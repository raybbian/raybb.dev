import type { Vec2 } from "./math";

// Shoelace; > 0 means CCW, matching the ear-convexity test below.
function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Position in `idx` of the first ear, or -1 if the ring has none. Same
// reflex / point-in-triangle test as `triangulateInto`, hoisted here so
// `triangulate` and `triangulateSteps` share the loop.
function findEar(poly: Vec2[], idx: number[]): number {
  const len = idx.length;
  for (let i = 0; i < len; i++) {
    const ia = idx[(i - 1 + len) % len];
    const ib = idx[i];
    const ic = idx[(i + 1) % len];
    const a = poly[ia];
    const b = poly[ib];
    const c = poly[ic];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cross <= 0) continue; // reflex or collinear

    let ear = true;
    for (let k = 0; k < len; k++) {
      const ip = idx[k];
      if (ip === ia || ip === ib || ip === ic) continue;
      if (inTriangle(poly[ip], a, b, c)) {
        ear = false;
        break;
      }
    }
    if (ear) return i;
  }
  return -1;
}

// Setup shared by both ear-clipping entry points: the active ring `idx`
// starts as 0..n-1, reversed if the polygon winds CW.
function initRing(poly: Vec2[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < poly.length; i++) idx.push(i);
  if (signedArea(poly) < 0) idx.reverse();
  return idx;
}

// Ear-clipping; returns index triplets.
export function triangulate(poly: Vec2[]): number[] {
  if (poly.length < 3) return [];
  const idx = initRing(poly);

  const tris: number[] = [];
  let guard = 2 * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    const i = findEar(poly, idx);
    if (i < 0) break;
    const len = idx.length;
    tris.push(idx[(i - 1 + len) % len], idx[i], idx[(i + 1) % len]);
    idx.splice(i, 1);
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

export interface EarClipStep {
  // Triangle clipped in this step, as indices into the original `poly`.
  tri: [number, number, number];
  // Snapshot of the still-open ring AFTER this clip (also indices into
  // `poly`), in CCW order. Empty once the final triangle is consumed.
  remaining: number[];
}

// Same algorithm as `triangulate`, but records each ear as it's clipped so
// a UI can scrub through the trace. Allocates per step; intended for
// figures, not the hot render path.
export function triangulateSteps(poly: Vec2[]): EarClipStep[] {
  if (poly.length < 3) return [];
  const idx = initRing(poly);

  const steps: EarClipStep[] = [];
  let guard = 2 * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    const i = findEar(poly, idx);
    if (i < 0) break;
    const len = idx.length;
    const tri: [number, number, number] = [
      idx[(i - 1 + len) % len],
      idx[i],
      idx[(i + 1) % len],
    ];
    idx.splice(i, 1);
    steps.push({ tri, remaining: idx.slice() });
  }
  if (idx.length === 3) {
    steps.push({ tri: [idx[0], idx[1], idx[2]], remaining: [] });
  }
  return steps;
}

// Zero-alloc `triangulate`: reads the first `n` verts of `poly`, uses
// caller-owned `idx` as scratch, writes `base + index` triplets into `out`
// at `off`. Returns the new write offset.
export function triangulateInto(
  poly: Vec2[],
  n: number,
  idx: number[],
  out: Uint32Array,
  off: number,
  base: number,
): number {
  if (n < 3) return off;
  for (let i = 0; i < n; i++) idx[i] = i;
  let len = n;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  if (area / 2 < 0) {
    for (let i = 0, k = n - 1; i < k; i++, k--) {
      const tmp = idx[i];
      idx[i] = idx[k];
      idx[k] = tmp;
    }
  }

  let guard = 2 * len;
  while (len > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < len; i++) {
      const ia = idx[(i - 1 + len) % len];
      const ib = idx[i];
      const ic = idx[(i + 1) % len];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) continue; // reflex or collinear

      let ear = true;
      for (let k = 0; k < len; k++) {
        const ip = idx[k];
        if (ip === ia || ip === ib || ip === ic) continue;
        if (inTriangle(poly[ip], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;

      out[off++] = base + ia;
      out[off++] = base + ib;
      out[off++] = base + ic;
      for (let k = i; k < len - 1; k++) idx[k] = idx[k + 1]; // splice(i, 1)
      len--;
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (len === 3) {
    out[off++] = base + idx[0];
    out[off++] = base + idx[1];
    out[off++] = base + idx[2];
  }
  return off;
}
