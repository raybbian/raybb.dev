import type { Vec2 } from "@/lib/math";
import type { FishGeometry } from "@/sim/Fish";

const FLOATS_PER_VERT = 8; // x,y,r,g,b,a,u,v
const FLOATS_PER_INSTANCE = 9; // fin/eye instances: cx,cy,rx,ry,rot,r,g,b,a

// Translates verts + fin/eye instances of a FishGeometry in place so the
// fish's head lands at (cx, cy). Sketches that camera-follow the head
// (fishSwim, uvMapping) call this every frame instead of threading an
// offset uniform through every program.
export function shiftFishGeometryToHead(
  geo: FishGeometry,
  headX: number,
  headY: number,
  cx: number,
  cy: number,
): void {
  const dx = cx - headX;
  const dy = cy - headY;
  const vs = geo.verts;
  for (let i = 0; i < geo.vCount; i += FLOATS_PER_VERT) {
    vs[i] += dx;
    vs[i + 1] += dy;
  }
  const fi = geo.finInstances;
  for (let i = 0; i < geo.finCount; i += FLOATS_PER_INSTANCE) {
    fi[i] += dx;
    fi[i + 1] += dy;
  }
  const ei = geo.eyeInstances;
  for (let i = 0; i < geo.eyeCount; i += FLOATS_PER_INSTANCE) {
    ei[i] += dx;
    ei[i + 1] += dy;
  }
}

// Mesh-level camera transform for figures that work with a FishBodyMesh
// (fragColorModes) rather than a FishGeometry. Returns a function that
// maps each world-space mesh vertex to canvas space.
export function createHeadCamera(
  headX: number,
  headY: number,
  cx: number,
  cy: number,
): (v: Vec2) => Vec2 {
  const dx = cx - headX;
  const dy = cy - headY;
  return (v) => ({ x: v.x + dx, y: v.y + dy });
}

// Low-pass-filtered follow target. Sketches that camera-follow a wandering
// fish use this instead of locking onto the head — the fish drifts a few
// pixels off-centre on direction changes and the camera eases back, which
// reads as "watching the koi" instead of "the koi is glued to the cursor".
//
// `rate` is the exponential decay constant (1/s). Higher = stiffer. The
// default 6 gives a ~165ms time constant — visible drift on a turn, fully
// caught up within a couple frames of straight swimming.
export class SmoothFollowCamera {
  x: number = 0;
  y: number = 0;
  private rate: number;
  private initialized = false;

  constructor(rate = 6) {
    this.rate = rate;
  }

  // Advance the camera toward (targetX, targetY). The first call snaps
  // to the target so the figure doesn't pan in from (0,0) on startup.
  follow(targetX: number, targetY: number, dt: number): void {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
      return;
    }
    const alpha = 1 - Math.exp(-this.rate * dt);
    this.x += (targetX - this.x) * alpha;
    this.y += (targetY - this.y) * alpha;
  }

  // Reset on resize / fish respawn so the next follow() snaps again.
  reset(): void {
    this.initialized = false;
  }
}
