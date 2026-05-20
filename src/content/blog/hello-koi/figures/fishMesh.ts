import { type Vec2 } from "@/lib/math";
import {
  BODY_WIDTHS,
  CHAIN_LINK_SIZE,
  CURVE_SEGMENTS,
  buildBodyControlRing,
  buildBodyMesh,
  type FishBodyMesh,
} from "@/sim/fishBodyMesh";

// Figures re-export the spine constants under their old names so existing
// imports keep working while pointing at the same source-of-truth values the
// renderer uses.
export const FISH_HALF_W = BODY_WIDTHS;
export const FISH_STEP = CHAIN_LINK_SIZE;
export { CURVE_SEGMENTS };
export type { FishBodyMesh as FishMesh };

// A spine laid along +x with a static y-offset (`bend`). Used by figures that
// just need to show a posed body — there's no chain follow, no per-frame
// dynamics.
export function straightSpineJoints(bend?: (s: number) => number): Vec2[] {
  const n = BODY_WIDTHS.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: i * CHAIN_LINK_SIZE,
      y: bend ? bend(i / (n - 1)) : 0,
    });
  }
  return out;
}

// Tangent angle at each joint, pointing from that joint toward the head — the
// same convention `Chain.resolve` uses for `Chain.angles`. For a chain-driven
// fish pass `chain.angles` directly instead.
export function anglesFromJoints(joints: Vec2[]): number[] {
  const n = joints.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let dx: number, dy: number;
    if (i === 0) {
      dx = joints[0].x - joints[1].x;
      dy = joints[0].y - joints[1].y;
    } else {
      dx = joints[i - 1].x - joints[i].x;
      dy = joints[i - 1].y - joints[i].y;
    }
    out.push(Math.atan2(dy, dx));
  }
  return out;
}

// Control polygon (pre-smoothing). Angles default to derived-from-joints,
// widths default to the unscaled canonical BODY_WIDTHS. For chain-driven
// fish whose linkSize was scaled, pass `fish.bodyWidth` so the body
// proportionally matches the scaled spine.
export function fishBodyRing(
  joints: Vec2[] = straightSpineJoints(),
  angles: number[] = anglesFromJoints(joints),
  widths: number[] = BODY_WIDTHS,
): Vec2[] {
  return buildBodyControlRing(joints, angles, widths).ring;
}

// Smoothed ribbon mesh. Same defaults as fishBodyRing.
export function fishBodyMesh(
  joints: Vec2[] = straightSpineJoints(),
  angles: number[] = anglesFromJoints(joints),
  segments: number = CURVE_SEGMENTS,
  widths: number[] = BODY_WIDTHS,
): FishBodyMesh {
  return buildBodyMesh(joints, angles, widths, undefined, segments);
}

// Centers `pts` in a w×h box and scales them uniformly to fit with `pad`
// breathing room. Y is flipped so model +y up reads as screen +y down.
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
    y: h / 2 - (p.y - cy) * s,
  }));
}
