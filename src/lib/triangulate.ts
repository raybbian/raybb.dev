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

// Ear-clipping; returns index triplets.
export function triangulate(poly: Vec2[]): number[] {
  const n = poly.length;
  if (n < 3) return [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  if (signedArea(poly) < 0) idx.reverse(); // normalize to CCW

  const tris: number[] = [];
  let guard = 2 * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) continue; // reflex or collinear

      let ear = true;
      for (let k = 0; k < idx.length; k++) {
        const ip = idx[k];
        if (ip === ia || ip === ib || ip === ic) continue;
        if (inTriangle(poly[ip], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;

      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
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
