import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { FISH_HALF_W, FISH_STEP } from "./fishMesh";
import { PALETTE as P } from "@/figures/palette";

// The site's real fish mesh seen as circles on a spine: each circle's radius
// is the koi body half-width at that joint, and the contour joins the
// outermost points — deliberately jaggy (the next figure smooths it with
// Catmull-Rom). Drag a circle to resize it and watch the contour follow.
//
// Foreground colors are theme-independent; only the backdrop tint changes.

const N = FISH_HALF_W.length;
const SPINE_LEN = (N - 1) * FISH_STEP;
const MAX_W = Math.max(...FISH_HALF_W);

class CirclesSketch implements Sketch {
  animated = true;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  // Per-joint radius multipliers on the real half-widths (1 = true mesh).
  private mult = FISH_HALF_W.map(() => 1);
  private dragging = -1;
  private hover = -1;
  private grabDist = 0;
  private grabMult = 1;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    void dpr;
  }

  // Uniform scale that fits the mesh into the area, aspect preserved (so it
  // looks like a fish, never stretched). Based on the true widths so the
  // frame stays fixed while a circle is dragged.
  private scale() {
    const modelW = SPINE_LEN + 2 * FISH_HALF_W[0];
    const modelH = 2 * MAX_W;
    return Math.min((this.w * 0.86) / modelW, (this.h * 0.78) / modelH);
  }

  private geom() {
    const s = this.scale();
    const cy = this.h * 0.5;
    const x0 = this.w / 2 - (SPINE_LEN / 2) * s;
    const pts: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < N; i++) {
      pts.push({
        x: x0 + i * FISH_STEP * s,
        y: cy,
        r: Math.max(1.5, FISH_HALF_W[i] * this.mult[i] * s),
      });
    }
    return pts;
  }

  pointer(p: PointerInfo) {
    const pts = this.geom();
    if (p.type === "down") {
      this.dragging = -1;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(p.x - pts[i].x, p.y - pts[i].y);
        if (d < pts[i].r + 14) {
          this.dragging = i;
          this.grabDist = d;
          this.grabMult = this.mult[i];
          break;
        }
      }
    } else if (p.type === "up") {
      this.dragging = -1;
    }

    this.hover = -1;
    for (let i = 0; i < N; i++) {
      if (Math.hypot(p.x - pts[i].x, p.y - pts[i].y) < pts[i].r + 14) {
        this.hover = i;
        break;
      }
    }

    if (this.dragging >= 0 && p.down) {
      const i = this.dragging;
      const c = pts[i];
      // Relative: move from the grab point changes the multiplier, so the
      // circle doesn't snap to the cursor.
      const dist = Math.hypot(p.x - c.x, p.y - c.y);
      const per = FISH_HALF_W[i] * this.scale(); // px per 1.0 multiplier
      const next = this.grabMult + (dist - this.grabDist) / per;
      this.mult[i] = Math.min(2.5, Math.max(0.05, next));
    }
  }

  frame(t: number) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0) return;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const pts = this.geom();
    const breathe = this.dragging < 0 ? 1 + Math.sin(t * 1.4) * 0.02 : 1;

    // Spine.
    ctx.strokeStyle = P.spine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();

    // Jaggy contour: nose, every circle's top, tail, every bottom back.
    const first = pts[0];
    const lastP = pts[N - 1];
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(first.x - first.r * breathe, first.y);
    for (let i = 0; i < N; i++)
      ctx.lineTo(pts[i].x, pts[i].y - pts[i].r * breathe);
    ctx.lineTo(lastP.x + lastP.r * breathe, lastP.y);
    for (let i = N - 1; i >= 0; i--)
      ctx.lineTo(pts[i].x, pts[i].y + pts[i].r * breathe);
    ctx.closePath();
    ctx.stroke();

    // Circles.
    ctx.lineWidth = 1.25;
    pts.forEach((p, i) => {
      ctx.strokeStyle =
        i === this.hover || i === this.dragging ? P.accent : P.structural;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * breathe, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Centers.
    ctx.fillStyle = P.point;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = P.hint;
    ctx.font = P.font;
    ctx.fillText("drag a circle to resize it", 12, h - 12);
  }

  dispose() {}
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new CirclesSketch(host.ctx);
  },
};

export default mod;
