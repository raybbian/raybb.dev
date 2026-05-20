import type { PointerInfo } from "@/figures/types";
import { PALETTE } from "@/figures/palette";

export interface SliderConfig {
  bandHeight?: number; // height of the bottom strip reserved for the slider
  padX?: number; // horizontal track padding
  knobRadius?: number;
  hitPad?: number; // extra vertical hit area around the track
  trackLineWidth?: number;
  // Discrete slider: knob snaps to `steps + 1` evenly-spaced positions and
  // `value` is the integer index 0..steps. Omitted (or 0) → continuous
  // 0..1 value.
  steps?: number;
  // Initial value (units depend on `steps` — see above).
  initial?: number;
}

export interface SliderGeometry {
  y: number;
  x0: number;
  x1: number;
  w: number;
  steps: number; // 0 = continuous
  knobX: number;
}

// Rendering-agnostic slider model. Owns the track band geometry, the
// drag-to-value mapping, and hit-testing. Sketches drive the visuals — 2D
// callers can use `draw2D`; GL callers (lotusPetalMix) read `geometry()`
// and run their own rect program.
export class SliderUI {
  value: number;
  private bandHeight: number;
  private padX: number;
  private knobRadius: number;
  private hitPad: number;
  private trackLineWidth: number;
  private steps: number;
  private w = 0;
  private h = 0;
  private dragging = false;

  constructor(cfg: SliderConfig = {}) {
    this.bandHeight = cfg.bandHeight ?? 44;
    this.padX = cfg.padX ?? 28;
    this.knobRadius = cfg.knobRadius ?? 9;
    this.hitPad = cfg.hitPad ?? 10;
    this.trackLineWidth = cfg.trackLineWidth ?? 2;
    this.steps = cfg.steps ?? 0;
    this.value = cfg.initial ?? (this.steps > 0 ? 0 : 0.5);
  }

  // Reserved band at the bottom of the canvas — sketches lay their main
  // content inside [0, h - bandHeight].
  get reservedBand(): number {
    return this.bandHeight;
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.steps > 0 && this.value > this.steps) this.value = this.steps;
  }

  // Re-clamp `value` against a freshly-known step count (earClip rebuilds
  // its triangle list on resize).
  setSteps(steps: number): void {
    this.steps = steps;
    if (this.steps > 0 && this.value > this.steps) this.value = this.steps;
  }

  geometry(): SliderGeometry {
    const y = this.h - this.bandHeight / 2;
    const x0 = this.padX;
    const x1 = this.w - this.padX;
    const w = Math.max(1, x1 - x0);
    const knobX =
      this.steps > 0
        ? this.steps === 0
          ? x0
          : x0 + (this.value / this.steps) * w
        : x0 + this.value * w;
    return { y, x0, x1, w, steps: this.steps, knobX };
  }

  // Returns true when the value changed.
  pointer(p: PointerInfo): boolean {
    const g = this.geometry();
    if (
      p.type === "down" &&
      Math.abs(p.y - g.y) < this.bandHeight / 2 + this.hitPad
    ) {
      this.dragging = true;
    } else if (p.type === "up") {
      this.dragging = false;
    }
    if (!this.dragging || !p.down) return false;
    const cx = Math.min(g.x1, Math.max(g.x0, p.x));
    if (this.steps > 0) {
      const next = Math.round(((cx - g.x0) / g.w) * this.steps);
      if (next === this.value) return false;
      this.value = next;
    } else {
      const next = (cx - g.x0) / g.w;
      if (next === this.value) return false;
      this.value = next;
    }
    return true;
  }

  // Default 2D rendering — track line, optional step dots (steps > 0),
  // accent knob, optional labels. earClip uses this directly.
  draw2D(
    ctx: CanvasRenderingContext2D,
    opts: { leftLabel?: string; rightLabel?: string } = {},
  ): void {
    const g = this.geometry();
    ctx.strokeStyle = PALETTE.divider;
    ctx.lineWidth = this.trackLineWidth;
    ctx.beginPath();
    ctx.moveTo(g.x0, g.y);
    ctx.lineTo(g.x1, g.y);
    ctx.stroke();

    if (this.steps > 0) {
      ctx.fillStyle = PALETTE.structural;
      for (let i = 0; i <= this.steps; i++) {
        const tx = g.x0 + (i / this.steps) * g.w;
        ctx.beginPath();
        ctx.arc(tx, g.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.arc(g.knobX, g.y, this.knobRadius - 1, 0, Math.PI * 2);
    ctx.fill();

    if (opts.leftLabel || opts.rightLabel) {
      ctx.fillStyle = PALETTE.hint;
      ctx.font = PALETTE.font;
      ctx.textBaseline = "alphabetic";
      if (opts.leftLabel) {
        ctx.textAlign = "left";
        ctx.fillText(opts.leftLabel, g.x0, g.y - 14);
      }
      if (opts.rightLabel) {
        ctx.textAlign = "right";
        ctx.fillText(opts.rightLabel, g.x1, g.y - 14);
      }
      ctx.textAlign = "left";
    }
  }
}
