import type { PointerInfo } from "@/figures/types";

// Drag-to-pan accumulator. Each pointer move adds a delta scaled by
// `perPx` to (panX, panY). Used by valueNoise/displacementNoise to scroll
// their noise field under the cursor.
export class PanTracker {
  panX = 0;
  panY = 0;
  private lastPx = 0;
  private lastPy = 0;
  private perPx: number;

  constructor(perPx = 1) {
    this.perPx = perPx;
  }

  // Returns true when the pan offset changed (caller can skip a redraw
  // when it didn't, though both current callers redraw unconditionally).
  pointer(p: PointerInfo): boolean {
    if (p.type === "down") {
      this.lastPx = p.x;
      this.lastPy = p.y;
      return false;
    }
    if (p.type === "move" && p.down) {
      this.panX -= (p.x - this.lastPx) * this.perPx;
      this.panY -= (p.y - this.lastPy) * this.perPx;
      this.lastPx = p.x;
      this.lastPy = p.y;
      return true;
    }
    return false;
  }
}
