import { createProgram } from "@/lib/gl";
import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { pickKoiColors } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/koiPattern.frag.glsl";

// Body-UV window shown across the panel. Centered on the body UV mid-point
// (0.5, 0.5) and sized so a 2.4-aspect panel shows roughly the same blob
// density a fish carries head-to-tail in the other figures.
const PAT_U_CENTER = 0.5;
const PAT_V_CENTER = 0.5;
const PAT_U_RANGE = 2.6;
const PAT_V_RANGE = 3.0;

// Default koi palette — porcelain white / persimmon / sumi black with the
// production renderer's seed offset.
const DEFAULT_BASE: [number, number, number] = [0.98, 0.97, 0.94];
const DEFAULT_MID: [number, number, number] = [0.93, 0.41, 0.18];
const DEFAULT_ACCENT: [number, number, number] = [0.08, 0.07, 0.09];
const DEFAULT_SEED: [number, number] = [13.7, 4.2];

class KoiPatternSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uBase: WebGLUniformLocation;
  private uMid: WebGLUniformLocation;
  private uAccent: WebGLUniformLocation;
  private uSeed: WebGLUniformLocation;
  private uUvCenter: WebGLUniformLocation;
  private uUvRange: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;

  private base = DEFAULT_BASE;
  private mid = DEFAULT_MID;
  private accent = DEFAULT_ACCENT;
  private seed = DEFAULT_SEED;
  private seedNum = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.uBase = gl.getUniformLocation(this.prog, "u_base")!;
    this.uMid = gl.getUniformLocation(this.prog, "u_mid")!;
    this.uAccent = gl.getUniformLocation(this.prog, "u_accent")!;
    this.uSeed = gl.getUniformLocation(this.prog, "u_seed")!;
    this.uUvCenter = gl.getUniformLocation(this.prog, "u_uvCenter")!;
    this.uUvRange = gl.getUniformLocation(this.prog, "u_uvRange")!;
    this.vao = gl.createVertexArray()!;
  }

  setTheme() {}

  resize() {}

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
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform3fv(this.uBase, this.base);
    gl.uniform3fv(this.uMid, this.mid);
    gl.uniform3fv(this.uAccent, this.accent);
    gl.uniform2fv(this.uSeed, this.seed);
    gl.uniform2f(this.uUvCenter, PAT_U_CENTER, PAT_V_CENTER);
    gl.uniform2f(this.uUvRange, PAT_U_RANGE, PAT_V_RANGE);
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
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new KoiPatternSketch(host.gl);
  },
};

export default mod;
