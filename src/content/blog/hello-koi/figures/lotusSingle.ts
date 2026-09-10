import type { FigureModule, FigureTheme, FigureView, Sketch } from "@/figures/types";
import { LotusRenderer } from "@/render/LotusRenderer";
import {
  LOTUS_INST_FLOATS,
  buildSingleLotusInstances,
  lotusPetalCount,
  lotusReach,
} from "@/sim/Lotuses";
import { ThemeMixer } from "@/figures/theme";
import { PALETTE as P } from "@/figures/palette";

const RINGS = 3;
const TAU = Math.PI * 2;
// Mirrors the production values in src/sim/Lotuses.ts so the standalone
// lotus breathes at the same rate as the embedded pond lotuses.
const FLUTTER_AMP = 0.025;
const FLUTTER_W = 1.6;
// Matches LilyLotusFigureScene.generateLayout's panel-edge padding so a
// reader comparing the two figures perceives the same lotus scale.
const PAD_FRAC = 0.06;

class LotusSingleSketch implements Sketch {
  animated = true;
  private gl: WebGL2RenderingContext;
  private renderer: LotusRenderer;
  private theme: ThemeMixer;
  private inst = new Float32Array(lotusPetalCount(RINGS) * LOTUS_INST_FLOATS);
  private cx = 0;
  private cy = 0;
  private size = 0;
  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.renderer = new LotusRenderer(gl);
    this.theme = new ThemeMixer(theme);
    this.renderer.setTheme(this.theme.mix);
  }

  setTheme(theme: FigureTheme) {
    this.theme.setTarget(theme);
  }

  resize({ w, h }: FigureView) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.cx = w * 0.5;
    this.cy = h * 0.5;
    const pad = h * PAD_FRAC;
    const maxReach = Math.min(w, h) * 0.5 - pad;
    // Invert lotusReach() so the bloom hugs the panel without clipping.
    const unitReach = lotusReach(1, RINGS);
    this.size = Math.max(0, maxReach / unitReach);
  }

  frame(t: number, dt: number) {
    const gl = this.gl;
    const { w, h } = this;
    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (w === 0 || h === 0) return;

    if (this.theme.advance(dt)) this.renderer.setTheme(this.theme.mix);

    const { count } = buildSingleLotusInstances(
      this.inst,
      this.cx,
      this.cy,
      this.size,
      t,
      { rings: RINGS, baseAngle: 0 },
    );

    // buildSingleLotusInstances omits flutter — add it here so the standalone
    // bloom has the same subtle motion as the production pond lotuses. The
    // per-petal seed at offset 12 is deterministic, so phases stay stable
    // across resizes.
    for (let i = 0; i < count; i++) {
      const o = i * LOTUS_INST_FLOATS;
      const seed = this.inst[o + 12];
      this.inst[o + 2] += FLUTTER_AMP * Math.sin(t * FLUTTER_W + seed * TAU);
    }

    this.renderer.draw(this.inst, count, w, h, 0);
  }

  dispose() {
    this.renderer.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new LotusSingleSketch(host.gl, theme);
  },
};

export default mod;
