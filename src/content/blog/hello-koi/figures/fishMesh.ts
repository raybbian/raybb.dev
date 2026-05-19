import { catmullRomClosed, type Vec2 } from "@/lib/math";

export const FISH_HALF_W = [68, 81, 84, 83, 77, 64, 51, 38, 32, 19];
export const FISH_STEP = 64;
export const CURVE_SEGMENTS = 14;
const SNOUT_ANGLE = Math.PI / 6;
const SNOUT_TIP_LEN = 4;
const HALF_PI = Math.PI / 2;
const HEADING = Math.PI;

// Fish.ts UV layout (Fish.ts ~99-109): u runs head→tail, v across the
// flanks; tip overshoots keep u changing through the nose/tail.
const TIP_U_OVERSHOOT = 1 / 30;
const SNOUT_U_SIDE = -1 / 10;
const SNOUT_U_TIP = -1 / 8;
const SNOUT_V_HI = 0.66;
const SNOUT_V_MID = 0.5;
const SNOUT_V_LO = 0.34;
const FLANK_V_TOP = 0;
const FLANK_V_BOT = 1;
const CENTER_V = 0.5;

function posInto(
  jx: number,
  jy: number,
  halfW: number,
  angleOffset: number,
  lenOffset: number,
): Vec2 {
  const ang = HEADING + angleOffset;
  const r = halfW + lenOffset;
  return { x: jx + Math.cos(ang) * r, y: jy + Math.sin(ang) * r };
}

// Control ring + index-aligned UVs, built in lockstep exactly as
// Fish.buildGeometry() builds bodyRing/bodyUV (Fish.ts ~594-635): top flank
// 0..N-1, tail tip, bottom flank N-1..0, then the three closed-mouth snout
// points. Shared by fishBodyRing() and fishBodyMesh() so neither restates it.
function bodyRingUV(bend: (s: number) => number) {
  const n = FISH_HALF_W.length;
  const jx = (i: number) => i * FISH_STEP;
  const jy = (i: number) => bend(i / (n - 1));
  const at = (i: number, off: number, len: number) =>
    posInto(jx(i), jy(i), FISH_HALF_W[i], off, len);
  const ring: Vec2[] = [];
  const uv: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    ring.push(at(i, HALF_PI, 0));
    uv.push({ x: i / (n - 1), y: FLANK_V_TOP });
  }
  ring.push(at(n - 1, Math.PI, 0));
  uv.push({ x: 1 + TIP_U_OVERSHOOT, y: CENTER_V });
  for (let i = n - 1; i >= 0; i--) {
    ring.push(at(i, -HALF_PI, 0));
    uv.push({ x: i / (n - 1), y: FLANK_V_BOT });
  }
  ring.push(at(0, -SNOUT_ANGLE, 0));
  uv.push({ x: SNOUT_U_SIDE, y: SNOUT_V_HI });
  ring.push(at(0, 0, SNOUT_TIP_LEN));
  uv.push({ x: SNOUT_U_TIP, y: SNOUT_V_MID });
  ring.push(at(0, SNOUT_ANGLE, 0));
  uv.push({ x: SNOUT_U_SIDE, y: SNOUT_V_LO });
  return { n, jx, jy, at, ring, uv };
}

export function fishBodyRing(bend: (s: number) => number = () => 0): Vec2[] {
  return bodyRingUV(bend).ring;
}

export interface FishMesh {
  // 2k = a smoothed boundary point, 2k+1 = its centerline partner at the
  // same u — the ribbon's two rails.
  verts: Vec2[];
  // Triangle index triplets stitching each [k, k+1] quad of the ribbon.
  indices: number[];
}

// Faithful mirror of the body half of Fish.buildGeometry() (Fish.ts
// ~636-727). The renderer does NOT ear-clip the body: it pairs every
// smoothed boundary sample with the spine centerline at the same u and
// stitches a quad ribbon — O(n), and the index list is constant no matter
// how the spine bends, so it can be built once.
export function fishBodyMesh(bend: (s: number) => number = () => 0): FishMesh {
  const { n, jx, jy, at, ring, uv } = bodyRingUV(bend);

  // Spine centerline polyline keyed by u: nose tip, the joints, tail tip.
  const clU: number[] = [SNOUT_U_TIP];
  const clP: Vec2[] = [at(0, 0, SNOUT_TIP_LEN)];
  for (let i = 0; i < n; i++) {
    clU.push(i / (n - 1));
    clP.push({ x: jx(i), y: jy(i) });
  }
  clU.push(1 + TIP_U_OVERSHOOT);
  clP.push(at(n - 1, Math.PI, 0));
  const li = clU.length - 1;
  const centerAt = (u: number): Vec2 => {
    if (u <= clU[0]) return { x: clP[0].x, y: clP[0].y };
    if (u >= clU[li]) return { x: clP[li].x, y: clP[li].y };
    for (let i = 1; i <= li; i++)
      if (u <= clU[i]) {
        const f = (u - clU[i - 1]) / (clU[i] - clU[i - 1]);
        return {
          x: clP[i - 1].x + (clP[i].x - clP[i - 1].x) * f,
          y: clP[i - 1].y + (clP[i].y - clP[i - 1].y) * f,
        };
      }
    return { x: clP[li].x, y: clP[li].y };
  };

  const ringPos = catmullRomClosed(ring, CURVE_SEGMENTS);
  const ringUV = catmullRomClosed(uv, CURVE_SEGMENTS);
  const m = ringPos.length;
  const verts: Vec2[] = [];
  for (let k = 0; k < m; k++) {
    verts.push(ringPos[k]);
    verts.push(centerAt(ringUV[k].x));
  }
  const indices: number[] = [];
  for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m;
    const r0 = 2 * k;
    const c0 = 2 * k + 1;
    const r1 = 2 * k2;
    const c1 = 2 * k2 + 1;
    indices.push(r0, r1, c1, r0, c1, c0);
  }
  return { verts, indices };
}

export function fitInto(pts: Vec2[], w: number, h: number, pad = 0.12): Vec2[] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const s = Math.min((w * (1 - pad)) / bw, (h * (1 - pad)) / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map((p) => ({
    x: w / 2 + (p.x - cx) * s,
    y: h / 2 - (p.y - cy) * s, // flip: model y up → screen y down
  }));
}
