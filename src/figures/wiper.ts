import type { PointerInfo } from "@/figures/types";

// Shared state for the "wiper" comparison figures (flat-vs-toon,
// shadows-on-off, …). Owns the [0,1] position and the drag latch; the
// pairing GLSL include `wiperHandle.glsl` consumes the same value as the
// fragment uniform `u_wiper`.
export class WiperState {
  value: number;
  private dragging = false;

  constructor(initial = 0.5) {
    this.value = initial;
  }

  pointer(p: PointerInfo, width: number): void {
    if (width <= 0) return;
    if (p.type === "down") {
      this.dragging = true;
      this.value = clamp01(p.x / width);
    } else if (p.type === "move" && this.dragging) {
      this.value = clamp01(p.x / width);
    } else if (p.type === "up") {
      this.dragging = false;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
