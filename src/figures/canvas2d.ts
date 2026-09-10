// 2D-canvas drawing primitives shared by sketches.
//
// Every length here is in world units (see `figures/units`). The host has
// already scaled the context, so these are written as plain numbers and come
// out proportionally identical at any figure size.

const DEFAULT_DIVIDER_INSET = 36;

// Vertical centre divider used by split-panel figures (catmullRom,
// fragColorModes, uvMapping). Inset keeps the line from touching the top
// and bottom edges of the panel.
export function drawVerticalDivider(
  ctx: CanvasRenderingContext2D,
  x: number,
  h: number,
  color: string,
  inset: number = DEFAULT_DIVIDER_INSET,
  lineWidth: number = 2.25,
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

export interface ArrowOpts {
  color: string;
  lineWidth?: number;
  headSize?: number;
  dashed?: boolean;
}

// Single-segment arrow with a filled triangular head. The head's base sits
// at the endpoint, so callers position the head exactly where they want it.
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  opts: ArrowOpts,
): void {
  const lineWidth = opts.lineWidth ?? 3.4;
  const head = opts.headSize ?? 18;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  const ux = dx / len;
  const uy = dy / len;
  // Shorten the shaft so it ends at the head's base instead of poking through.
  const shaftEndX = toX - ux * head;
  const shaftEndY = toY - uy * head;

  ctx.save();
  ctx.strokeStyle = opts.color;
  ctx.fillStyle = opts.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  if (opts.dashed) ctx.setLineDash([head * 0.6, head * 0.5]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Triangular head: base at (shaftEnd ± perp*head/2), tip at (toX,toY).
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(shaftEndX + px * head * 0.45, shaftEndY + py * head * 0.45);
  ctx.lineTo(shaftEndX - px * head * 0.45, shaftEndY - py * head * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
