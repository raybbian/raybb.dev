import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { FISH_HALF_W, fishBodyRing, fitInto } from "./fishMesh";
import { triangulateSteps, type EarClipStep } from "@/lib/triangulate";
import { PALETTE as P } from "@/figures/palette";

// Step-by-step ear clipping over a low-res fish polygon. The raw control
// ring is used directly (no Catmull-Rom smoothing) so each ear is visibly
// chunky and the slider has a handful of steps instead of a hundred. The
// slider lives inside the canvas — it's drawn during frame() and dragged
// through the same pointer events the host already forwards.

const SLIDER_BAND = 44; // height of the bottom strip reserved for the slider
const SLIDER_PAD_X = 28;
const KNOB_R = 8;
const HIT_PAD = 10; // extra vertical hit area around the track
const FILL = "rgba(45,212,191,0.16)";
const FILL_LATEST = "rgba(45,212,191,0.42)";

// Ear-clipping scans from index 0, so the polygon's first vertex acts as
// the anchor. The tail tip itself is the most convex vertex on the ring
// and would be clipped immediately, making the trace trivial — start one
// step past it (the first vertex on the bottom flank) so the search has
// to actually walk before it finds an ear.
const ANCHOR_OFFSET = FISH_HALF_W.length + 1;

function rotated<T>(arr: T[], k: number): T[] {
  const n = arr.length;
  const o = ((k % n) + n) % n;
  return arr.slice(o).concat(arr.slice(0, o));
}

class EarClipSketch implements Sketch {
  animated = false;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private poly: { x: number; y: number }[] = [];
  private steps: EarClipStep[] = [];
  private step = 0;
  private dragging = false;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    // Polygon owns the area above the slider band; raw ring → ~24 verts.
    const polyH = Math.max(1, h - SLIDER_BAND);
    this.poly = fitInto(rotated(fishBodyRing(), ANCHOR_OFFSET), w, polyH, 0.18);
    this.steps = triangulateSteps(this.poly);
    if (this.step > this.steps.length) this.step = this.steps.length;
  }

  private trackGeom() {
    const y = this.h - SLIDER_BAND / 2;
    const x0 = SLIDER_PAD_X;
    const x1 = this.w - SLIDER_PAD_X;
    return { y, x0, x1, w: Math.max(1, x1 - x0), n: this.steps.length };
  }

  private knobX() {
    const { x0, w, n } = this.trackGeom();
    return n === 0 ? x0 : x0 + (this.step / n) * w;
  }

  pointer(p: PointerInfo) {
    const { y, x0, x1, w, n } = this.trackGeom();
    if (p.type === "down" && Math.abs(p.y - y) < SLIDER_BAND / 2 + HIT_PAD) {
      this.dragging = true;
    } else if (p.type === "up") {
      this.dragging = false;
    }
    if (this.dragging && p.down && n > 0) {
      const cx = Math.min(x1, Math.max(x0, p.x));
      this.step = Math.round(((cx - x0) / w) * n);
    }
  }

  private drawTri(a: number, b: number, c: number, fill: string, stroke: string, width: number) {
    const ctx = this.ctx;
    const pa = this.poly[a];
    const pb = this.poly[b];
    const pc = this.poly[c];
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private drawSlider() {
    const ctx = this.ctx;
    const { y, x0, x1, w, n } = this.trackGeom();

    ctx.strokeStyle = P.divider;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();

    if (n > 0) {
      ctx.fillStyle = P.structural;
      for (let i = 0; i <= n; i++) {
        const tx = x0 + (i / n) * w;
        ctx.beginPath();
        ctx.arc(tx, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const kx = this.knobX();
    ctx.fillStyle = P.accent;
    ctx.beginPath();
    ctx.arc(kx, y, KNOB_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = P.hint;
    ctx.font = P.font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(`ear ${this.step} / ${n}`, x0, y - 14);
    ctx.textAlign = "right";
    ctx.fillText("drag to clip ears", x1, y - 14);
    ctx.textAlign = "left";
  }

  frame() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0 || this.poly.length === 0) return;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const { steps, step } = this;

    // Clipped ears so far. Older ones fade to a structural outline; the
    // latest one keeps the accent so the eye lands on what just came off.
    for (let i = 0; i < step; i++) {
      const [a, b, c] = steps[i].tri;
      const latest = i === step - 1;
      this.drawTri(
        a,
        b,
        c,
        latest ? FILL_LATEST : FILL,
        latest ? P.accent : P.structural,
        latest ? 1.5 : 1,
      );
    }

    // Still-open ring. At step 0 there's no recorded "remaining" yet — the
    // original polygon is itself the ring. After the last clip the ring is
    // gone; only triangles remain.
    let remaining: number[];
    if (step === 0) {
      remaining = this.poly.map((_, i) => i);
    } else if (step <= steps.length) {
      remaining = steps[step - 1].remaining;
    } else {
      remaining = [];
    }

    if (remaining.length >= 3) {
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const p0 = this.poly[remaining[0]];
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < remaining.length; i++) {
        const p = this.poly[remaining[i]];
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // Vertex dots on whichever points are still on the open ring (or all of
    // them when nothing has been clipped yet).
    ctx.fillStyle = P.point;
    for (const i of remaining) {
      const p = this.poly[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawSlider();
  }

  dispose() {}
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new EarClipSketch(host.ctx);
  },
};

export default mod;
