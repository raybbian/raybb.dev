import { catmullRomClosedInto, poolAt, type Vec2 } from "@/lib/math";

// Single source of truth for spine geometry, body silhouette, and UV layout.
// Both the live renderer (Fish.buildGeometry) and the blog-post figures pull
// constants and the ring/mesh builders from here, so the figures cannot drift
// from the real fish they describe.

export const BODY_WIDTHS = [68, 81, 84, 83, 77, 64, 51, 38, 32, 19];
export const BODY_SEGMENTS = BODY_WIDTHS.length;
export const CHAIN_LINK_SIZE = 64;
export const CHAIN_MAX_BEND = Math.PI / 8;
export const CURVE_SEGMENTS = 14;

export const HALF_PI = Math.PI / 2;
export const SNOUT_ANGLE = Math.PI / 6;
export const SNOUT_TIP_LEN = 4;

// u runs head→tail along the body, v across the flanks. Tip overshoots keep
// u changing through the nose/tail instead of flattening into a patch.
export const TIP_U_OVERSHOOT = 1 / 30;
export const SNOUT_U_SIDE = -1 / 10;
export const SNOUT_U_TIP = -1 / 8;
export const SNOUT_V_HI = 0.66;
export const SNOUT_V_MID = 0.5;
export const SNOUT_V_LO = 0.34;
export const FLANK_V_TOP = 0;
export const FLANK_V_BOT = 1;
export const CENTER_V = 0.5;

// Per-frame snout posture. The live fish morphs its mouth open/closed and
// telescopes the lips forward; the figures use the static closed-mouth form.
export interface SnoutShape {
  sideAngle: number; // angle offset from a[0] for the lip corners
  sideLenOffset: number; // bodyWidth[0] + this = lip radius from joint 0
  tipLenOffset: number; // bodyWidth[0] + this = tip radius from joint 0
  protrudeX: number; // forward push added to all three snout points
  protrudeY: number;
}

export const CLOSED_SNOUT: SnoutShape = {
  sideAngle: SNOUT_ANGLE,
  sideLenOffset: 0,
  tipLenOffset: SNOUT_TIP_LEN,
  protrudeX: 0,
  protrudeY: 0,
};

// Hot-path callers (Fish.ts at 60fps × many fish) own one of these and pass
// it every frame to keep mesh construction allocation-free.
export interface BodyMeshScratch {
  ring: Vec2[];
  uv: Vec2[];
  ringPos: Vec2[];
  ringUV: Vec2[];
  clU: number[];
  clP: Vec2[];
  clEnd0: Vec2;
  clEnd1: Vec2;
  center: Vec2;
  verts: Vec2[];
  uvs: Vec2[];
  indices: number[];
}

export function createBodyMeshScratch(): BodyMeshScratch {
  return {
    ring: [],
    uv: [],
    ringPos: [],
    ringUV: [],
    clU: [],
    clP: [],
    clEnd0: { x: 0, y: 0 },
    clEnd1: { x: 0, y: 0 },
    center: { x: 0, y: 0 },
    verts: [],
    uvs: [],
    indices: [],
  };
}

export interface FishBodyMesh {
  // 2k = a smoothed boundary point, 2k+1 = its centerline partner at the
  // same u — the ribbon's two rails.
  verts: Vec2[];
  // UVs aligned with `verts`. Boundary entries carry their flank/snout v;
  // centerline entries share u with the boundary partner and v = CENTER_V.
  uvs: Vec2[];
  indices: number[];
}

// Builds the body silhouette control polygon and the index-aligned UV array.
// `outRing`/`outUV` opt callers into pooled output; otherwise fresh arrays.
// Order: top flank head→tail, tail tip, bottom flank tail→head, snout side
// hi, snout tip, snout side lo (matches Fish.buildGeometry()).
export function buildBodyControlRing(
  joints: Vec2[],
  angles: number[],
  widths: number[],
  snout: SnoutShape = CLOSED_SNOUT,
  outRing?: Vec2[],
  outUV?: Vec2[],
): { ring: Vec2[]; uv: Vec2[] } {
  const ring = outRing ?? [];
  const uv = outUV ?? [];
  const n = widths.length;
  let bw = 0;
  const setUV = (k: number, x: number, y: number) => {
    const u = poolAt(uv, k);
    u.x = x;
    u.y = y;
  };
  for (let i = 0; i < n; i++) {
    const p = poolAt(ring, bw);
    const r = widths[i];
    const a = angles[i] + HALF_PI;
    p.x = joints[i].x + Math.cos(a) * r;
    p.y = joints[i].y + Math.sin(a) * r;
    setUV(bw, i / (n - 1), FLANK_V_TOP);
    bw++;
  }
  {
    const i = n - 1;
    const p = poolAt(ring, bw);
    const r = widths[i];
    const a = angles[i] + Math.PI;
    p.x = joints[i].x + Math.cos(a) * r;
    p.y = joints[i].y + Math.sin(a) * r;
    setUV(bw, 1 + TIP_U_OVERSHOOT, CENTER_V);
    bw++;
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = poolAt(ring, bw);
    const r = widths[i];
    const a = angles[i] - HALF_PI;
    p.x = joints[i].x + Math.cos(a) * r;
    p.y = joints[i].y + Math.sin(a) * r;
    setUV(bw, i / (n - 1), FLANK_V_BOT);
    bw++;
  }
  const sideR = widths[0] + snout.sideLenOffset;
  const tipR = widths[0] + snout.tipLenOffset;
  const px = snout.protrudeX;
  const py = snout.protrudeY;
  {
    const p = poolAt(ring, bw);
    const a = angles[0] - snout.sideAngle;
    p.x = joints[0].x + Math.cos(a) * sideR + px;
    p.y = joints[0].y + Math.sin(a) * sideR + py;
    setUV(bw, SNOUT_U_SIDE, SNOUT_V_HI);
    bw++;
  }
  {
    const p = poolAt(ring, bw);
    const a = angles[0];
    p.x = joints[0].x + Math.cos(a) * tipR + px;
    p.y = joints[0].y + Math.sin(a) * tipR + py;
    setUV(bw, SNOUT_U_TIP, SNOUT_V_MID);
    bw++;
  }
  {
    const p = poolAt(ring, bw);
    const a = angles[0] + snout.sideAngle;
    p.x = joints[0].x + Math.cos(a) * sideR + px;
    p.y = joints[0].y + Math.sin(a) * sideR + py;
    setUV(bw, SNOUT_U_SIDE, SNOUT_V_LO);
    bw++;
  }
  if (ring.length > bw) ring.length = bw;
  if (uv.length > bw) uv.length = bw;
  return { ring, uv };
}

// The renderer does NOT ear-clip the body: every smoothed boundary sample is
// paired with the spine centerline at the same u and stitched as a quad
// ribbon. O(n) per frame and a fixed-size index list no matter how the spine
// bends — see Fish.ts ~636-727 for the original implementation.
export function buildBodyMesh(
  joints: Vec2[],
  angles: number[],
  widths: number[],
  snout: SnoutShape = CLOSED_SNOUT,
  segments: number = CURVE_SEGMENTS,
  scratch?: BodyMeshScratch,
): FishBodyMesh {
  const s = scratch ?? createBodyMeshScratch();
  const { ring, uv } = buildBodyControlRing(
    joints,
    angles,
    widths,
    snout,
    s.ring,
    s.uv,
  );
  const ringPos = catmullRomClosedInto(ring, segments, s.ringPos);
  const ringUV = catmullRomClosedInto(uv, segments, s.ringUV);

  // Centerline polyline keyed by u. Endpoints sit OUTSIDE u ∈ [0,1] (snout
  // tip < 0, tail tip > 1) so the boundary's overshooting u's still map.
  const n = widths.length;
  const clU = s.clU;
  const clP = s.clP;
  let m = 0;
  clU[m] = SNOUT_U_TIP;
  {
    const tipR = widths[0] + snout.tipLenOffset;
    const ang = angles[0];
    s.clEnd0.x = joints[0].x + Math.cos(ang) * tipR + snout.protrudeX;
    s.clEnd0.y = joints[0].y + Math.sin(ang) * tipR + snout.protrudeY;
    clP[m] = s.clEnd0;
  }
  m++;
  for (let i = 0; i < n; i++) {
    clU[m] = i / (n - 1);
    clP[m] = joints[i];
    m++;
  }
  clU[m] = 1 + TIP_U_OVERSHOOT;
  {
    const i = n - 1;
    const r = widths[i];
    const ang = angles[i] + Math.PI;
    s.clEnd1.x = joints[i].x + Math.cos(ang) * r;
    s.clEnd1.y = joints[i].y + Math.sin(ang) * r;
    clP[m] = s.clEnd1;
  }
  m++;
  const clLen = m;
  if (clU.length > clLen) clU.length = clLen;
  if (clP.length > clLen) clP.length = clLen;

  const center = s.center;
  const li = clLen - 1;
  const centerAt = (u: number): Vec2 => {
    if (u <= clU[0]) {
      center.x = clP[0].x;
      center.y = clP[0].y;
      return center;
    }
    if (u >= clU[li]) {
      center.x = clP[li].x;
      center.y = clP[li].y;
      return center;
    }
    for (let i = 1; i <= li; i++) {
      if (u <= clU[i]) {
        const t = (u - clU[i - 1]) / (clU[i] - clU[i - 1]);
        const a0 = clP[i - 1];
        const a1 = clP[i];
        center.x = a0.x + (a1.x - a0.x) * t;
        center.y = a0.y + (a1.y - a0.y) * t;
        return center;
      }
    }
    center.x = clP[li].x;
    center.y = clP[li].y;
    return center;
  };

  const rN = ringPos.length;
  const verts = s.verts;
  const uvs = s.uvs;
  const indices = s.indices;
  let vw = 0;
  for (let k = 0; k < rN; k++) {
    const rp = ringPos[k];
    const ru = ringUV[k];
    const cp = centerAt(ru.x);
    const v0 = poolAt(verts, vw);
    v0.x = rp.x;
    v0.y = rp.y;
    const u0 = poolAt(uvs, vw);
    u0.x = ru.x;
    u0.y = ru.y;
    vw++;
    const v1 = poolAt(verts, vw);
    v1.x = cp.x;
    v1.y = cp.y;
    const u1 = poolAt(uvs, vw);
    u1.x = ru.x;
    u1.y = CENTER_V;
    vw++;
  }
  if (verts.length > vw) verts.length = vw;
  if (uvs.length > vw) uvs.length = vw;

  let iw = 0;
  for (let k = 0; k < rN; k++) {
    const k2 = (k + 1) % rN;
    const r0 = 2 * k;
    const c0 = 2 * k + 1;
    const r1 = 2 * k2;
    const c1 = 2 * k2 + 1;
    indices[iw++] = r0;
    indices[iw++] = r1;
    indices[iw++] = c1;
    indices[iw++] = r0;
    indices[iw++] = c1;
    indices[iw++] = c0;
  }
  if (indices.length > iw) indices.length = iw;

  return { verts, uvs, indices };
}
