// 2D-canvas drawing primitives shared by sketches.

const DEFAULT_DIVIDER_INSET = 16;

// Vertical centre divider used by split-panel figures (catmullRom,
// fragColorModes, uvMapping). Inset keeps the line from touching the top
// and bottom edges of the panel.
export function drawVerticalDivider(
  ctx: CanvasRenderingContext2D,
  x: number,
  h: number,
  color: string,
  inset: number = DEFAULT_DIVIDER_INSET,
  lineWidth: number = 1,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x, inset);
  ctx.lineTo(x, h - inset);
  ctx.stroke();
  ctx.restore();
}
