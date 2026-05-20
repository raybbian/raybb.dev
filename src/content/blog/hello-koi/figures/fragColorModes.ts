import type { FigureModule, Sketch } from "@/figures/types";
import { fishBodyMesh } from "./fishMesh";
import { Fish } from "@/sim/Fish";
import { pickKoiColors } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import { PALETTE as P } from "@/figures/palette";
import type { Vec2 } from "@/lib/math";

const SEGMENTS = 6;
const FIGURE_SCALE = 0.4;
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
  private fish: Fish | null = null;
  private lastT: number | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.worldW = (w / 2) * WORLD_MULT;
    this.worldH = h * WORLD_MULT;
    const colors = pickKoiColors(mulberry32(FIGURE_SEED));
    this.fish = new Fish(
      { x: this.worldW / 2, y: this.worldH / 2 },
      {
        base: colors.base,
        mid: colors.mid,
        accent: colors.accent,
        fin: colors.fin,
      },
      0.4,
      FIGURE_SCALE,
      { noisePhaseHeading: FIGURE_NOISE_PHASE, seed: FIGURE_SEED },
      FIGURE_SCALE,
    );
    this.lastT = null;
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

    // Camera = head. Map world verts to a given panel centre.
    const head = fish.spine.joints[0];
    const toCanvas = (panelCx: number, v: Vec2): Vec2 => ({
      x: panelCx + (v.x - head.x),
      y: h / 2 + (v.y - head.y),
    });

    const drawTri = (panelCx: number, a: Vec2, b: Vec2, c: Vec2, u: number, v: number) => {
      const ca = toCanvas(panelCx, a);
      const cb = toCanvas(panelCx, b);
      const cc = toCanvas(panelCx, c);
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
      const ca = toCanvas(panelW / 2, a);
      const cb = toCanvas(panelW / 2, b);
      const cc = toCanvas(panelW / 2, c);
      const ccx = (ca.x + cb.x + cc.x) / 3;
      const ccy = (ca.y + cb.y + cc.y) / 3;
      const u = Math.max(0, Math.min(1, ccx / panelW));
      const v = Math.max(0, Math.min(1, ccy / h));
      drawTri(panelW / 2, a, b, c, u, v);
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
      drawTri(panelW + panelW / 2, a, b, c, u, v);
    }
    ctx.restore();

    ctx.strokeStyle = P.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelW, 16);
    ctx.lineTo(panelW, h - 16);
    ctx.stroke();

    ctx.fillStyle = P.hint;
    ctx.font = P.font;
    ctx.fillText("world space", 10, 18);
    ctx.fillText("body space (uv)", panelW + 10, 18);

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("color = hsl(gl_FragCoord.xy / resolution, …);", 10, h - 10);
    ctx.fillText("color = hsl(v_uv, …);", panelW + 10, h - 10);
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
