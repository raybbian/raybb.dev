import { catmullRomClosed, type Vec2 } from "@/lib/math";
import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import {
  CURVE_SEGMENTS,
  anglesFromJoints,
  fishBodyRing,
  fitInto,
  straightSpineJoints,
} from "./fishMesh";
import { PALETTE as P } from "@/figures/palette";
import { drawVerticalDivider } from "@/figures/canvas2d";

type Pt = { x: number; y: number };

// Uniform open Catmull-Rom through `p`, `seg` samples per span.
function catmullOpen(p: Pt[], seg: number): Pt[] {
  const n = p.length;
  const at = (i: number) => p[Math.max(0, Math.min(n - 1, i))];
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < seg; s++) {
      const u = s / seg;
      const u2 = u * u;
      const u3 = u2 * u;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * u +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * u +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push(at(n - 1));
  return out;
}

const LEFT0: Pt[] = [
  { x: 0.1, y: 0.7 },
  { x: 0.3, y: 0.25 },
  { x: 0.5, y: 0.6 },
  { x: 0.7, y: 0.3 },
  { x: 0.9, y: 0.65 },
];

class CatmullSketch implements Sketch {
  // Static fish — nothing to animate.
  animated = false;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private left = LEFT0.map((p) => ({ ...p }));
  private drag = -1;
  private rightRing: Vec2[] = [];
  private rightSmooth: Vec2[] = [];

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    void dpr;
    if (w === 0 || h === 0) return;
    // Straight-spine body lives in the right half. Built once at resize-time
    // and fit into the panel; no per-frame work.
    const joints = straightSpineJoints();
    const angles = anglesFromJoints(joints);
    const rawRing = fishBodyRing(joints, angles);
    const rw = w / 2 - 36;
    const rx = w / 2 + 12;
    this.rightRing = fitInto(rawRing, rw, h, 0.16).map((p) => ({
      x: p.x + rx,
      y: p.y,
    }));
    this.rightSmooth = catmullRomClosed(this.rightRing, CURVE_SEGMENTS);
  }

  private leftRect() {
    const pad = 24;
    return { x: pad, y: pad, w: this.w / 2 - pad * 1.5, h: this.h - pad * 2 };
  }

  private map(p: Pt, r: { x: number; y: number; w: number; h: number }): Pt {
    return { x: r.x + p.x * r.w, y: r.y + p.y * r.h };
  }

  pointer(p: PointerInfo) {
    const r = this.leftRect();
    if (p.type === "down") {
      this.drag = -1;
      this.left.forEach((cp, i) => {
        const m = this.map(cp, r);
        if (Math.hypot(p.x - m.x, p.y - m.y) < 16) this.drag = i;
      });
    } else if (p.type === "up") {
      this.drag = -1;
    }
    if (this.drag >= 0 && p.down) {
      this.left[this.drag] = {
        x: Math.min(1, Math.max(0, (p.x - r.x) / r.w)),
        y: Math.min(1, Math.max(0, (p.y - r.y) / r.h)),
      };
    }
  }

  private stroke(pts: Pt[], close: boolean) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (close) ctx.closePath();
    ctx.stroke();
  }

  frame() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0) return;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    drawVerticalDivider(ctx, w / 2, h, P.divider);

    // ---- Left: open spline through draggable points ----
    const lr = this.leftRect();
    const lpts = this.left.map((p) => this.map(p, lr));
    ctx.strokeStyle = P.structural;
    ctx.lineWidth = 1;
    this.stroke(lpts, false);
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2.5;
    this.stroke(catmullOpen(lpts, 24), false);
    lpts.forEach((m, i) => {
      ctx.fillStyle = i === this.drag ? P.accent : P.point;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // ---- Right: the real fish mesh, posed and still ----
    ctx.strokeStyle = P.structural;
    ctx.lineWidth = 1;
    this.stroke(this.rightRing, true);
    this.rightRing.forEach((m) => {
      ctx.fillStyle = P.structural;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2.5;
    this.stroke(this.rightSmooth, true);
  }

  dispose() {}
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new CatmullSketch(host.ctx);
  },
};

export default mod;
