import { createProgram } from "@/lib/gl";
import type { FigureModule, Sketch } from "@/figures/types";
import VS from "@/render/shaders/water.vert.glsl";
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

const DEFAULT_BASE: [number, number, number] = [0.98, 0.97, 0.94];
const DEFAULT_MID: [number, number, number] = [0.93, 0.41, 0.18];
const DEFAULT_ACCENT: [number, number, number] = [0.08, 0.07, 0.09];
const DEFAULT_SEED: [number, number] = [13.7, 4.2];

class KoiStepsSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uBase: WebGLUniformLocation;
  private uMid: WebGLUniformLocation;
  private uAccent: WebGLUniformLocation;
  private uSeed: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.uBase = gl.getUniformLocation(this.prog, "u_base")!;
    this.uMid = gl.getUniformLocation(this.prog, "u_mid")!;
    this.uAccent = gl.getUniformLocation(this.prog, "u_accent")!;
    this.uSeed = gl.getUniformLocation(this.prog, "u_seed")!;
    this.vao = gl.createVertexArray()!;
  }

  setTheme() {}
  resize() {}

  frame() {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform3fv(this.uBase, DEFAULT_BASE);
    gl.uniform3fv(this.uMid, DEFAULT_MID);
    gl.uniform3fv(this.uAccent, DEFAULT_ACCENT);
    gl.uniform2fv(this.uSeed, DEFAULT_SEED);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
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
