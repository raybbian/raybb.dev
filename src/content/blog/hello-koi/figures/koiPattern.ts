import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { DEFAULT_KOI_COLORS, pickKoiColors } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import { FullscreenShader } from "@/figures/FullscreenShader";
import FS from "./shaders/koiPattern.frag.glsl";

// Body-UV window shown across the panel. Centered on the body UV mid-point
// (0.5, 0.5). V_RANGE is fixed; U_RANGE is derived per-frame from the live
// panel aspect so the noise stays isotropic (no horizontal stretch) at any
// canvas size — the shader bakes a 3× horizontal multiplier into st.x (see
// noise.glsl ASPECT), so feeding equal U/V ranges into a square would squash
// the field 3×. Derivation: u_range.x * ASPECT / w == v_range / h.
const PAT_U_CENTER = 0.5;
const PAT_V_CENTER = 0.5;
const PAT_V_RANGE = 3.0;
const SHADER_ASPECT = 3.0;

class KoiPatternSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private shader: FullscreenShader;
  private uBase: WebGLUniformLocation | null;
  private uMid: WebGLUniformLocation | null;
  private uAccent: WebGLUniformLocation | null;
  private uSeed: WebGLUniformLocation | null;
  private uUvCenter: WebGLUniformLocation | null;
  private uUvRange: WebGLUniformLocation | null;

  private base: [number, number, number] = [
    DEFAULT_KOI_COLORS.base[0],
    DEFAULT_KOI_COLORS.base[1],
    DEFAULT_KOI_COLORS.base[2],
  ];
  private mid: [number, number, number] = [
    DEFAULT_KOI_COLORS.mid[0],
    DEFAULT_KOI_COLORS.mid[1],
    DEFAULT_KOI_COLORS.mid[2],
  ];
  private accent: [number, number, number] = [
    DEFAULT_KOI_COLORS.accent[0],
    DEFAULT_KOI_COLORS.accent[1],
    DEFAULT_KOI_COLORS.accent[2],
  ];
  private seed: [number, number] = [DEFAULT_KOI_COLORS.seed[0], DEFAULT_KOI_COLORS.seed[1]];
  private seedNum = 0;
  private uRange = PAT_V_RANGE / SHADER_ASPECT;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new FullscreenShader(gl, FS);
    this.uBase = this.shader.uniform("u_base");
    this.uMid = this.shader.uniform("u_mid");
    this.uAccent = this.shader.uniform("u_accent");
    this.uSeed = this.shader.uniform("u_seed");
    this.uUvCenter = this.shader.uniform("u_uvCenter");
    this.uUvRange = this.shader.uniform("u_uvRange");
  }

  setTheme() {}

  // Fullscreen shader: the koi-pattern shader is dimensionless, sampled across
  // the panel via UV; no scene-px literals to scale.
  resize(w: number, h: number, _dpr: number, _screenScale: number) {
    if (h > 0) this.uRange = (PAT_V_RANGE * (w / h)) / SHADER_ASPECT;
  }

  pointer(p: PointerInfo) {
    if (p.type !== "up") return;
    this.seedNum = ((this.seedNum + 1) * 1013904223) >>> 0;
    const colors = pickKoiColors(mulberry32(this.seedNum));
    this.base = [colors.base[0], colors.base[1], colors.base[2]];
    this.mid = [colors.mid[0], colors.mid[1], colors.mid[2]];
    this.accent = [colors.accent[0], colors.accent[1], colors.accent[2]];
    this.seed = colors.seed;
  }

  frame() {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.draw(() => {
      if (this.uBase) gl.uniform3fv(this.uBase, this.base);
      if (this.uMid) gl.uniform3fv(this.uMid, this.mid);
      if (this.uAccent) gl.uniform3fv(this.uAccent, this.accent);
      if (this.uSeed) gl.uniform2fv(this.uSeed, this.seed);
      if (this.uUvCenter) gl.uniform2f(this.uUvCenter, PAT_U_CENTER, PAT_V_CENTER);
      if (this.uUvRange) gl.uniform2f(this.uUvRange, this.uRange, PAT_V_RANGE);
    });
  }

  dispose() {
    this.shader.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new KoiPatternSketch(host.gl);
  },
};

export default mod;
