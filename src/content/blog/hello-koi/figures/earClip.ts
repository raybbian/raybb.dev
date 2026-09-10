import type { FigureModule, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { FISH_HALF_W, fishBodyRing, fitInto } from "./fishMesh";
import { triangulateSteps, type EarClipStep } from "@/lib/triangulate";
import { PALETTE as P } from "@/figures/palette";
import { SliderUI } from "@/figures/SliderUI";

// Step-by-step ear clipping over a low-res fish polygon. The raw control
// ring is used directly (no Catmull-Rom smoothing) so each ear is visibly
// chunky and the slider has a handful of steps instead of a hundred. The
// slider lives inside the canvas — it's drawn during frame() and dragged
// through the same pointer events the host already forwards.

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
  private slider: SliderUI;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.slider = new SliderUI({ steps: 0, initial: 0 });
  }

  setTheme() {}

  resize({ w, h }: FigureView) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    // Polygon owns the area above the slider band; raw ring → ~24 verts.
    const polyH = Math.max(1, h - this.slider.reservedBand);
    this.poly = fitInto(rotated(fishBodyRing(), ANCHOR_OFFSET), w, polyH, 0.18);
    this.steps = triangulateSteps(this.poly);
    this.slider.setSteps(this.steps.length);
    this.slider.layout(w, h);
  }

  pointer(p: PointerInfo) {
    this.slider.pointer(p);
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

  frame() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0 || this.poly.length === 0) return;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const { steps } = this;
    const step = this.slider.value as number;

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
        latest ? 4.5 : 3.38,
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
      ctx.lineWidth = 6.19;
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
      ctx.arc(p.x, p.y, 7.31, 0, Math.PI * 2);
      ctx.fill();
    }

    this.slider.draw2D(ctx, {
      leftLabel: `ear ${step} / ${steps.length}`,
      rightLabel: "drag to clip ears",
    });
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
