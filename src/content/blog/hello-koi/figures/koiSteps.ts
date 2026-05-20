import type { FigureModule, Sketch } from "@/figures/types";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { DEFAULT_KOI_COLORS } from "@/sim/koiPattern";
import FS from "./shaders/koiSteps.frag.glsl";

// 1×N strip of square cells, flush together, showing the stages that turn
// value noise into a koi pattern. The math tracks pattern.frag.glsl
// line-for-line, switching on one piece per cell:
//
//   1. value noise — one octave
//   2. FBM         — sum a few octaves (gain/lacunarity)
//   3. warp        — domain-warp the FBM samples
//   4. threshold   — smoothstep across T1 / T2 (binary mask)
//   5. colored     — finally mix base / mid / accent
//
// The shader at ./shaders/koiSteps.frag.glsl branches on cell index
// derived from v_uv.x; this sketch just hands it the koi palette.

const BASE: [number, number, number] = [
  DEFAULT_KOI_COLORS.base[0],
  DEFAULT_KOI_COLORS.base[1],
  DEFAULT_KOI_COLORS.base[2],
];
const MID: [number, number, number] = [
  DEFAULT_KOI_COLORS.mid[0],
  DEFAULT_KOI_COLORS.mid[1],
  DEFAULT_KOI_COLORS.mid[2],
];
const ACCENT: [number, number, number] = [
  DEFAULT_KOI_COLORS.accent[0],
  DEFAULT_KOI_COLORS.accent[1],
  DEFAULT_KOI_COLORS.accent[2],
];

class KoiStepsSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private shader: FullscreenShader;
  private uBase: WebGLUniformLocation | null;
  private uMid: WebGLUniformLocation | null;
  private uAccent: WebGLUniformLocation | null;
  private uSeed: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new FullscreenShader(gl, FS);
    this.uBase = this.shader.uniform("u_base");
    this.uMid = this.shader.uniform("u_mid");
    this.uAccent = this.shader.uniform("u_accent");
    this.uSeed = this.shader.uniform("u_seed");
  }

  setTheme() {}
  resize() {}

  frame() {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.draw(() => {
      if (this.uBase) gl.uniform3fv(this.uBase, BASE);
      if (this.uMid) gl.uniform3fv(this.uMid, MID);
      if (this.uAccent) gl.uniform3fv(this.uAccent, ACCENT);
      if (this.uSeed) gl.uniform2fv(this.uSeed, DEFAULT_KOI_COLORS.seed);
    });
  }

  dispose() {
    this.shader.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 5,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new KoiStepsSketch(host.gl);
  },
};

export default mod;
