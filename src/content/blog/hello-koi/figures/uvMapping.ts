import type { Vec2 } from "@/lib/math";
import type { FigureModule, Sketch } from "@/figures/types";
import { PALETTE as P } from "@/figures/palette";
import { Fish, type FishGeometry } from "@/sim/Fish";
import { DEFAULT_KOI_COLORS } from "@/sim/koiPattern";
import { FishRenderer } from "@/render/FishRenderer";
import { PatternBakeProgram } from "@/render/patternBaker";
import { figureScreenScale, FIGURE_FISH_SCALE } from "@/figures/scale";
import { createFigureFish } from "@/figures/figureFish";
import {
  shiftFishGeometryToHead,
  SmoothFollowCamera,
} from "@/figures/fishCamera";
import { drawVerticalDivider } from "@/figures/canvas2d";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/koiPattern.frag.glsl";

// Left panel: the whole fish, camera-followed (so it stays put while the
// body articulates). The body is rendered through the real FishRenderer —
// body-only enable, pattern-on, shadow/cast off — so the per-fragment koi
// pattern lookup is exactly what readers see in production. Right panel:
// the koi pattern in UV space drawn into the same hidden canvas via the
// windowed koiPattern shader, then drawImage'd next to it. A single
// quadrilateral outline on each side marks the patch of body the
// highlighted UV rectangle currently covers.
const WORLD_MULT = 3;
const FIGURE_SEED = 0x21bd5e3a;
const FIGURE_NOISE_PHASE = 19.7;
const FLOATS_PER_VERT = 8;
const UV_OFFSET = 6;

const RECT_U_MIN = 0.18;
const RECT_U_MAX = 0.62;
const RECT_V_MIN = 0.18;
const RECT_V_MAX = 0.82;

const PAT_U_CENTER = 0.5;
const PAT_V_CENTER = 0.5;
const PAT_U_RANGE = 1.4;
const PAT_V_RANGE = 2.6;

function uvToPatternPx(
  u: number,
  v: number,
  x0: number,
  pw: number,
  ph: number,
): Vec2 {
  return {
    x: x0 + ((u - PAT_U_CENTER) / PAT_U_RANGE + 0.5) * pw,
    y: ((v - PAT_V_CENTER) / PAT_V_RANGE + 0.5) * ph,
  };
}

class UVMappingSketch implements Sketch {
  animated = true;

  private ctx: CanvasRenderingContext2D;
  private glCanvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private renderer: FishRenderer;
  private patBaker: PatternBakeProgram;
  private patUvCenter: WebGLUniformLocation | null;
  private patUvRange: WebGLUniformLocation | null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private worldW = 0;
  private worldH = 0;
  private fish: Fish | null = null;
  private lastT: number | null = null;
  private camera = new SmoothFollowCamera();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.glCanvas = document.createElement("canvas");
    const gl = this.glCanvas.getContext("webgl2", {
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("webgl2 unavailable for uv mapping");
    this.gl = gl;
    // Full fish — caudal, body, dorsal, fins, eyes — so readers see the
    // whole koi, not a body-only slice. Shadow + cast stay off (no
    // ShadowRenderer mask in this figure); the dorsal self-shadow band
    // would read as a stray dark stripe without that mask, so skip it too.
    this.renderer = new FishRenderer(gl, {
      features: { pattern: true, shadow: false, cast: false },
      enable: { dorsalShadow: false },
    });
    this.renderer.setPalettes([DEFAULT_KOI_COLORS]);
    this.patBaker = new PatternBakeProgram(gl, VS, FS);
    this.patUvCenter = this.patBaker.getUniformLocation("u_uvCenter");
    this.patUvRange = this.patBaker.getUniformLocation("u_uvRange");
  }

  setTheme() {}

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    if (w === 0 || h === 0) return;
    this.glCanvas.width = Math.max(1, Math.ceil(w * dpr));
    this.glCanvas.height = Math.max(1, Math.ceil(h * dpr));
    const lw = w / 2;
    this.worldW = lw * WORLD_MULT;
    this.worldH = h * WORLD_MULT;
    const screenScale = figureScreenScale(lw);
    const scale = FIGURE_FISH_SCALE * screenScale;
    this.fish = createFigureFish({
      origin: { x: this.worldW / 2, y: this.worldH / 2 },
      colors: {
        base: DEFAULT_KOI_COLORS.base,
        mid: DEFAULT_KOI_COLORS.mid,
        accent: DEFAULT_KOI_COLORS.accent,
        fin: DEFAULT_KOI_COLORS.fin,
      },
      scale,
      screenScale,
      seed: FIGURE_SEED,
      noisePhase: { heading: FIGURE_NOISE_PHASE },
    });
    this.lastT = null;
    this.camera.reset();
  }

  frame(t: number) {
    const { ctx, w, h, fish } = this;
    if (w === 0 || h === 0 || !fish) return;
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    fish.resolve(dt, null, [], this.worldW, this.worldH, 0);

    const lw = w / 2;
    const rw = w / 2;
    const rx0 = w / 2;

    // Pull the live body geometry the renderer would consume in production.
    // Smoothed camera follow: head drifts off-centre on turns and the camera
    // eases back, which reads more like watching than locked-to. Mutate in
    // place — Fish rebuilds the pool next frame.
    const geo = fish.buildGeometry();
    const head = fish.spine.joints[0];
    this.camera.follow(head.x, head.y, dt);
    shiftFishGeometryToHead(geo, this.camera.x, this.camera.y, lw / 2, h / 2);

    // --- Hidden WebGL render: body in left viewport, pattern in right ---
    const gl = this.gl;
    const dpr = this.dpr;
    const pw = this.glCanvas.width;
    const ph = this.glCanvas.height;
    const vxLeftW = Math.round(lw * dpr);
    const vxRightW = pw - vxLeftW;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.viewport(0, 0, vxLeftW, ph);
    this.renderer.draw(geo, lw, h, 0);

    gl.viewport(vxLeftW, 0, vxRightW, ph);
    this.patBaker.use();
    this.patBaker.setPalette(DEFAULT_KOI_COLORS);
    if (this.patUvCenter)
      gl.uniform2f(this.patUvCenter, PAT_U_CENTER, PAT_V_CENTER);
    if (this.patUvRange)
      gl.uniform2f(this.patUvRange, PAT_U_RANGE, PAT_V_RANGE);
    this.patBaker.bake();

    // --- 2D canvas composite + overlays ---
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.glCanvas, 0, 0, pw, ph, 0, 0, w, h);

    const highlightIdx: number[] = [];
    for (let k = geo.bodyIdxStart; k < geo.shadowIdxStart; k += 3) {
      if (this.triInRect(geo, k)) highlightIdx.push(k);
    }
    const corners = this.pickCornerVerts(geo, highlightIdx);

    if (corners) this.drawBodyHighlight(geo, corners, lw, h);
    this.drawPatternRect(rx0, rw, h);
    if (corners) this.drawCornerLines(geo, corners, rx0, rw, h);
    drawVerticalDivider(ctx, w / 2, h, P.divider);
  }

  private uvAt(geo: FishGeometry, vertIdx: number): Vec2 {
    const off = vertIdx * FLOATS_PER_VERT + UV_OFFSET;
    return { x: geo.verts[off], y: geo.verts[off + 1] };
  }

  private posAt(geo: FishGeometry, vertIdx: number): Vec2 {
    const off = vertIdx * FLOATS_PER_VERT;
    return { x: geo.verts[off], y: geo.verts[off + 1] };
  }

  private triInRect(geo: FishGeometry, k: number): boolean {
    const ua = this.uvAt(geo, geo.indices[k]);
    const ub = this.uvAt(geo, geo.indices[k + 1]);
    const uc = this.uvAt(geo, geo.indices[k + 2]);
    const u = (ua.x + ub.x + uc.x) / 3;
    const v = (ua.y + ub.y + uc.y) / 3;
    return (
      u >= RECT_U_MIN && u <= RECT_U_MAX && v >= RECT_V_MIN && v <= RECT_V_MAX
    );
  }

  // Returns the four body-vertex indices closest to the UV corners
  // (TL, TR, BR, BL), or null if no triangle's centroid landed in the rect.
  private pickCornerVerts(
    geo: FishGeometry,
    highlightIdx: number[],
  ): [number, number, number, number] | null {
    if (highlightIdx.length === 0) return null;
    const corners: [number, number][] = [
      [RECT_U_MIN, RECT_V_MIN],
      [RECT_U_MAX, RECT_V_MIN],
      [RECT_U_MAX, RECT_V_MAX],
      [RECT_U_MIN, RECT_V_MAX],
    ];
    const vSet = new Set<number>();
    for (const k of highlightIdx) {
      vSet.add(geo.indices[k]);
      vSet.add(geo.indices[k + 1]);
      vSet.add(geo.indices[k + 2]);
    }
    const closest = (cu: number, cv: number): number => {
      let bestIdx = -1;
      let bestD = Infinity;
      for (const vi of vSet) {
        const uv = this.uvAt(geo, vi);
        const du = uv.x - cu;
        const dv = uv.y - cv;
        const d = du * du + dv * dv;
        if (d < bestD) {
          bestD = d;
          bestIdx = vi;
        }
      }
      return bestIdx;
    };
    return [
      closest(corners[0][0], corners[0][1]),
      closest(corners[1][0], corners[1][1]),
      closest(corners[2][0], corners[2][1]),
      closest(corners[3][0], corners[3][1]),
    ];
  }

  private drawBodyHighlight(
    geo: FishGeometry,
    corners: [number, number, number, number],
    lw: number,
    h: number,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, lw, h);
    ctx.clip();
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    const [tl, tr, br, bl] = corners;
    const ptl = this.posAt(geo, tl);
    const ptr = this.posAt(geo, tr);
    const pbr = this.posAt(geo, br);
    const pbl = this.posAt(geo, bl);
    ctx.moveTo(ptl.x, ptl.y);
    ctx.lineTo(ptr.x, ptr.y);
    ctx.lineTo(pbr.x, pbr.y);
    ctx.lineTo(pbl.x, pbl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawPatternRect(rx0: number, rw: number, h: number) {
    const { ctx } = this;
    const tl = uvToPatternPx(RECT_U_MIN, RECT_V_MIN, rx0, rw, h);
    const tr = uvToPatternPx(RECT_U_MAX, RECT_V_MIN, rx0, rw, h);
    const br = uvToPatternPx(RECT_U_MAX, RECT_V_MAX, rx0, rw, h);
    const bl = uvToPatternPx(RECT_U_MIN, RECT_V_MAX, rx0, rw, h);
    ctx.save();
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawCornerLines(
    geo: FishGeometry,
    corners: [number, number, number, number],
    rx0: number,
    rw: number,
    h: number,
  ) {
    const { ctx } = this;
    const uvs: [number, number][] = [
      [RECT_U_MIN, RECT_V_MIN],
      [RECT_U_MAX, RECT_V_MIN],
      [RECT_U_MAX, RECT_V_MAX],
      [RECT_U_MIN, RECT_V_MAX],
    ];
    ctx.save();
    ctx.strokeStyle = P.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (let i = 0; i < 4; i++) {
      const fp = this.posAt(geo, corners[i]);
      const pp = uvToPatternPx(uvs[i][0], uvs[i][1], rx0, rw, h);
      ctx.beginPath();
      ctx.moveTo(fp.x, fp.y);
      ctx.lineTo(pp.x, pp.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  dispose() {
    this.renderer.dispose();
    this.patBaker.dispose();
  }
}

const mod: FigureModule = {
  kind: "2d",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "2d") throw new Error("expected 2d host");
    return new UVMappingSketch(host.ctx);
  },
};

export default mod;
