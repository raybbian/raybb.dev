import type { FigureModule, Sketch } from "@/figures/types";
import { drawArrow, drawVerticalDivider } from "@/figures/canvas2d";
import { PALETTE as P } from "@/figures/palette";

// Top-down diagram explaining the heightmap. The pond floor is the panel
// itself; the circle (tall caster, h=1.0) and the square (shorter caster,
// h=0.5) are top-down silhouettes. The square is offset perpendicular to
// the sun direction from the circle's down-sun ray so that:
//   - each caster has its own distinct heightmap texel (drawn opaque,
//     circle on top of square — the tallest wins where they overlap), and
//   - the sample-pixel point P = C + sun*0.5K still lies inside the
//     square, so walking down-sun from P by sun*0.5K lands exactly on the
//     circle's heightmap cell A. That walk reads h=1.0, which exceeds the
//     square's own height (0.5), so the sample pixel is shadowed.

const SUN: [number, number] = [0.6, 0.8];
// Perpendicular to SUN (clockwise 90°). Used to offset the square sideways
// so its heightmap projection is distinct from the circle's.
const PERP: [number, number] = [0.8, -0.6];
const H_CIRCLE = 1.0;
const H_SQUARE = 0.5;

const PANEL_INSET = 0;
const LABEL_PAD = 8;

const HEIGHTMAP_BG = "rgba(148,163,184,0.10)";
// Opaque heightmap-cell fills — circle cell draws on top of square cell,
// so where they overlap the circle's height wins (matches what the floor
// texel actually stores).
const CIRCLE_CELL_FILL = "rgb(45,212,191)";
const SQUARE_CELL_FILL = "rgb(148,163,184)";
const CIRCLE_FILL = "rgba(45,212,191,0.55)";
const CIRCLE_STROKE = P.accent;
const SQUARE_FILL = "rgba(148,163,184,0.55)";
const SQUARE_STROKE = "rgba(226,232,240,0.95)";
const SHADOW_ON_SQUARE = "rgba(15,23,42,0.45)";
const SUN_DOT = "rgba(253,224,71,0.95)";
const SUN_ARROW = "rgba(253,224,71,0.95)";

interface Layout {
  panelW: number;
  panelH: number;
  K: number;
  circleX: number;
  circleY: number;
  circleR: number;
  squareX: number;
  squareY: number;
  squareS: number;
  // Sample-pixel point: lies on the circle's down-sun ray at height 0.5,
  // and (by construction) inside the square.
  sampleX: number;
  sampleY: number;
  // Circle's heightmap texel (down-sun from the circle by sun*K).
  cellAX: number;
  cellAY: number;
  // Square's heightmap texel (down-sun from the square by sun*0.5K).
  cellBX: number;
  cellBY: number;
}

function computeLayout(panelW: number, panelH: number): Layout {
  const K = panelH * 0.62;
  const circleR = panelH * 0.1;
  const squareS = panelH * 0.14;
  const circleX = panelW * 0.32;
  const circleY = panelH * 0.2;
  // Sample-pixel point: circle's shadow centre at the square's height.
  const sampleX = circleX + SUN[0] * H_SQUARE * K;
  const sampleY = circleY + SUN[1] * H_SQUARE * K;
  // Offset the square perpendicular to the sun so its heightmap texel is
  // visually distinct from the circle's. d = 1.1 * squareS keeps the
  // sample point comfortably inside the square (chebyshev offset 0.88s).
  const d = 1.1 * squareS;
  const squareX = sampleX + PERP[0] * d;
  const squareY = sampleY + PERP[1] * d;
  const cellAX = circleX + SUN[0] * H_CIRCLE * K;
  const cellAY = circleY + SUN[1] * H_CIRCLE * K;
  const cellBX = squareX + SUN[0] * H_SQUARE * K;
  const cellBY = squareY + SUN[1] * H_SQUARE * K;
  return {
    panelW,
    panelH,
    K,
    circleX,
    circleY,
    circleR,
    squareX,
    squareY,
    squareS,
    sampleX,
    sampleY,
    cellAX,
    cellAY,
    cellBX,
    cellBY,
  };
}

function drawHeightmapBackground(
  ctx: CanvasRenderingContext2D,
  x0: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = HEIGHTMAP_BG;
  ctx.fillRect(
    x0 + PANEL_INSET,
    PANEL_INSET,
    w - 2 * PANEL_INSET,
    h - 2 * PANEL_INSET,
  );
  ctx.restore();
}

// Square cell first, then circle cell on top — the heightmap stores the
// max height per texel, so the taller caster's value wins where they
// overlap. Drawing in that order makes the rendering match the semantics.
function drawHeightmapCells(
  ctx: CanvasRenderingContext2D,
  x0: number,
  L: Layout,
  labels: boolean,
) {
  ctx.save();
  ctx.fillStyle = SQUARE_CELL_FILL;
  ctx.fillRect(
    x0 + L.cellBX - L.squareS,
    L.cellBY - L.squareS,
    L.squareS * 2,
    L.squareS * 2,
  );

  ctx.fillStyle = CIRCLE_CELL_FILL;
  ctx.beginPath();
  ctx.arc(x0 + L.cellAX, L.cellAY, L.circleR, 0, Math.PI * 2);
  ctx.fill();

  if (labels) {
    ctx.fillStyle = P.point;
    ctx.font = P.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // "h = 0.5" goes in the part of the square cell that isn't covered by
    // the circle cell — its centre is far enough from the circle cell's
    // centre (|cellB - cellA| ≈ 1.1 squareS) that the label sits clear.
    ctx.fillText("h = 0.5", x0 + L.cellBX, L.cellBY);
    ctx.fillText("h = 1.0", x0 + L.cellAX, L.cellAY);
  }
  ctx.restore();
}

function drawCasters(
  ctx: CanvasRenderingContext2D,
  x0: number,
  L: Layout,
  circleAlpha: number,
  squareAlpha: number,
  labelHeights: boolean,
) {
  ctx.save();
  ctx.globalAlpha = squareAlpha;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = SQUARE_FILL;
  ctx.strokeStyle = SQUARE_STROKE;
  ctx.beginPath();
  ctx.rect(
    x0 + L.squareX - L.squareS,
    L.squareY - L.squareS,
    L.squareS * 2,
    L.squareS * 2,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = circleAlpha;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = CIRCLE_FILL;
  ctx.strokeStyle = CIRCLE_STROKE;
  ctx.beginPath();
  ctx.arc(x0 + L.circleX, L.circleY, L.circleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (labelHeights) {
    ctx.save();
    ctx.fillStyle = P.point;
    ctx.font = P.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("h = 1.0", x0 + L.circleX, L.circleY);
    ctx.fillText("h = 0.5", x0 + L.squareX, L.squareY);
    ctx.restore();
  }
}

// Soft dark disk at the sample point, clipped to the square — the circle's
// silhouette projected down-sun to the square's surface (h=0.5).
function drawCircleShadowOnSquare(
  ctx: CanvasRenderingContext2D,
  x0: number,
  L: Layout,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    x0 + L.squareX - L.squareS,
    L.squareY - L.squareS,
    L.squareS * 2,
    L.squareS * 2,
  );
  ctx.clip();
  ctx.fillStyle = SHADOW_ON_SQUARE;
  ctx.beginPath();
  ctx.arc(x0 + L.sampleX, L.sampleY, L.circleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSunIndicator(ctx: CanvasRenderingContext2D, x0: number) {
  const x = x0 + PANEL_INSET + 8;
  const y = PANEL_INSET + 8;
  ctx.save();
  ctx.fillStyle = SUN_DOT;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  const tipX = x + SUN[0] * 16;
  const tipY = y + SUN[1] * 16;
  drawArrow(ctx, x + SUN[0] * 5, y + SUN[1] * 5, tipX, tipY, {
    color: SUN_ARROW,
    lineWidth: 1.5,
    headSize: 6,
  });
  ctx.fillStyle = P.hint;
  ctx.font = P.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("sun", tipX + 5, tipY);
  ctx.restore();
}

function drawRightArrow(ctx: CanvasRenderingContext2D, x0: number, L: Layout) {
  // From the sample pixel on the square down-sun by sun*0.5K to the
  // circle's heightmap cell. The shader reads h=1.0 there, which exceeds
  // the square's own height (0.5), so the sample pixel is shadowed.
  const startX = x0 + L.sampleX;
  const startY = L.sampleY;
  const tipX = x0 + L.cellAX;
  const tipY = L.cellAY;

  drawArrow(ctx, startX, startY, tipX, tipY, {
    color: P.accent,
    lineWidth: 2,
    headSize: 10,
    dashed: true,
  });

  ctx.save();
  ctx.fillStyle = P.accent;
  ctx.beginPath();
  ctx.arc(startX, startY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = P.point;
  ctx.font = P.font;
  ctx.textBaseline = "middle";
  // "sample pixel" sits to the upper-left of P, clear of the dashed line
  // (which heads down-sun, toward the lower-right).
  ctx.textAlign = "right";
  ctx.fillText("sample pixel", startX - LABEL_PAD, startY - LABEL_PAD);
  ctx.textAlign = "center";
  ctx.fillText("texel: h = 1.0", tipX, tipY + L.circleR + LABEL_PAD + 2);
  ctx.restore();
}

class HeightmapDiagramSketch implements Sketch {
  animated = false;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private layout: Layout | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) {
      this.layout = null;
      return;
    }
    this.layout = computeLayout(w / 2, h);
  }

  frame() {
    const ctx = this.ctx;
    const { w, h, layout } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || h === 0 || !layout) return;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    // Left panel: both casters' heightmap texels (opaque; circle on top of
    // square — the taller height wins where they overlap), plus the
    // casters themselves with inline height labels.
    drawHeightmapBackground(ctx, 0, layout.panelW, h);
    drawHeightmapCells(ctx, 0, layout, true);
    drawCasters(ctx, 0, layout, 1, 1, true);
    drawSunIndicator(ctx, 0);

    // Right panel: same heightmap (still opaque). The shader walks down-sun
    // from a sample pixel on the (opaque) square; the circle's shadow lands
    // on the square at that point, and the walk reads h=1.0 at A.
    drawHeightmapBackground(ctx, layout.panelW, layout.panelW, h);
    drawHeightmapCells(ctx, layout.panelW, layout, false);
    drawCasters(ctx, layout.panelW, layout, 0.35, 1, false);
    drawCircleShadowOnSquare(ctx, layout.panelW, layout);
    drawRightArrow(ctx, layout.panelW, layout);
    drawSunIndicator(ctx, layout.panelW);

    drawVerticalDivider(ctx, layout.panelW, h, P.divider);
  }

  dispose() {}
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new HeightmapDiagramSketch(host.ctx);
  },
};

export default mod;
