import type { FigureModule, Sketch } from "@/figures/types";
import { fishBodyMesh } from "./fishMesh";
import { Fish } from "@/sim/Fish";
import { DEFAULT_KOI_COLORS } from "@/sim/koiPattern";
import { PALETTE as P } from "@/figures/palette";
import { figureScreenScale, FIGURE_FISH_SCALE, figureFont } from "@/figures/scale";
import { createFigureFish } from "@/figures/figureFish";
import { createHeadCamera, SmoothFollowCamera } from "@/figures/fishCamera";
import { drawVerticalDivider } from "@/figures/canvas2d";
import type { Vec2 } from "@/lib/math";

const SEGMENTS = 6;
const FIGURE_SEED = 0xa53f7b91;
const FIGURE_NOISE_PHASE = 5.4;
const WORLD_MULT = 3;

function hslString(h: number, s: number, l: number): string {
  return `hsl(${(h * 360).toFixed(1)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%)`;
}

// Two panels showing the same wandering fish, camera-followed so it stays
// at each panel's centre while you watch it turn. World-space color comes
// from each triangle's canvas centroid (shifts as the body rotates through
// canvas pixels). Body-space color comes from each triangle's mesh UV —
// locked to the body regardless of how it bends or where it points.
class FragColorSketch implements Sketch {
  animated = true;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private worldW = 0;
  private worldH = 0;
  private screenScale = 1;
  private fish: Fish | null = null;
  private lastT: number | null = null;
  private camera = new SmoothFollowCamera();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  // Two-panel figure: the fish lives in a half-width column, so its scale is
  // derived from `panelW`, not the full canvas. Label text uses the host-
  // supplied `screenScale` (which IS based on canvas width) so it tracks the
  // other figures' labels.
  resize(w: number, h: number, _dpr: number, screenScale: number) {
    this.w = w;
    this.h = h;
    this.screenScale = screenScale;
    if (w === 0 || h === 0) return;
    const panelW = w / 2;
    this.worldW = panelW * WORLD_MULT;
    this.worldH = h * WORLD_MULT;
    const panelScale = figureScreenScale(panelW);
    const scale = FIGURE_FISH_SCALE * panelScale;
    this.fish = createFigureFish({
      origin: { x: this.worldW / 2, y: this.worldH / 2 },
      colors: {
        base: DEFAULT_KOI_COLORS.base,
        mid: DEFAULT_KOI_COLORS.mid,
        accent: DEFAULT_KOI_COLORS.accent,
        fin: DEFAULT_KOI_COLORS.fin,
      },
      scale,
      screenScale: panelScale,
      seed: FIGURE_SEED,
      noisePhase: { heading: FIGURE_NOISE_PHASE },
    });
    this.lastT = null;
    this.camera.reset();
  }

  frame(t: number) {
    const ctx = this.ctx;
    const { w, h, fish } = this;
    ctx.clearRect(0, 0, w, h);
    if (w === 0 || !fish) return;

    const panelW = w / 2;
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    fish.resolve(dt, null, [], this.worldW, this.worldH, 0);

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    const mesh = fishBodyMesh(
      fish.spine.joints,
      fish.spine.angles,
      SEGMENTS,
      fish.bodyWidth,
    );

    // Smoothed camera follow shared between panels: the head drifts off
    // each panel's centre on turns, both panels see the same lag.
    const head = fish.spine.joints[0];
    this.camera.follow(head.x, head.y, dt);
    const leftCam = createHeadCamera(
      this.camera.x,
      this.camera.y,
      panelW / 2,
      h / 2,
    );
    const rightCam = createHeadCamera(
      this.camera.x,
      this.camera.y,
      panelW + panelW / 2,
      h / 2,
    );

    const drawTri = (
      cam: (v: Vec2) => Vec2,
      a: Vec2,
      b: Vec2,
      c: Vec2,
      u: number,
      v: number,
    ) => {
      const ca = cam(a);
      const cb = cam(b);
      const cc = cam(c);
      ctx.fillStyle = hslString(u, 0.85, 0.4 + 0.3 * v);
      ctx.beginPath();
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.lineTo(cc.x, cc.y);
      ctx.closePath();
      ctx.fill();
    };

    // LEFT panel — world-space coloring (canvas centroid of each triangle).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, panelW, h);
    ctx.clip();
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const ia = mesh.indices[k];
      const ib = mesh.indices[k + 1];
      const ic = mesh.indices[k + 2];
      const a = mesh.verts[ia];
      const b = mesh.verts[ib];
      const c = mesh.verts[ic];
      const ca = leftCam(a);
      const cb = leftCam(b);
      const cc = leftCam(c);
      const ccx = (ca.x + cb.x + cc.x) / 3;
      const ccy = (ca.y + cb.y + cc.y) / 3;
      const u = Math.max(0, Math.min(1, ccx / panelW));
      const v = Math.max(0, Math.min(1, ccy / h));
      drawTri(leftCam, a, b, c, u, v);
    }
    ctx.restore();

    // RIGHT panel — body-space coloring (UV centroid of each triangle).
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelW, 0, panelW, h);
    ctx.clip();
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const ia = mesh.indices[k];
      const ib = mesh.indices[k + 1];
      const ic = mesh.indices[k + 2];
      const a = mesh.verts[ia];
      const b = mesh.verts[ib];
      const c = mesh.verts[ic];
      const uvA = mesh.uvs[ia];
      const uvB = mesh.uvs[ib];
      const uvC = mesh.uvs[ic];
      const u = Math.max(0, Math.min(1, (uvA.x + uvB.x + uvC.x) / 3));
      const v = Math.max(0, Math.min(1, (uvA.y + uvB.y + uvC.y) / 3));
      drawTri(rightCam, a, b, c, u, v);
    }
    ctx.restore();

    drawVerticalDivider(ctx, panelW, h, P.divider);

    ctx.fillStyle = P.hint;
    ctx.font = figureFont(this.screenScale);
    ctx.fillText("world space", 10, 18);
    ctx.fillText("body space (uv)", panelW + 10, 18);
  }

  dispose() {}
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new FragColorSketch(host.ctx);
  },
};

export default mod;
