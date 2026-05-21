import { bindInstancedFloatAttribs, createProgram } from "@/lib/gl";
import { LOTUS_INST_FLOATS } from "@/sim/Lotuses";
import {
  LOTUS_H,
  castShadowOffset,
  shadowMargin,
} from "@/render/ShadowRenderer";
import VS from "@/render/shaders/lotus.vert.glsl";
import FS from "@/render/shaders/lotus.frag.glsl";
import CAST_FS from "@/render/shaders/lotus.shadow.frag.glsl";

// Bleed past the [0,1]x[-1,1] petal box so lotus.frag's rounded edge (ROUND)
// is never clipped by the quad.
const PAD = 0.55;

function petalQuad(): Float32Array {
  const x0 = -PAD;
  const x1 = 1 + PAD;
  const y0 = -(1 + PAD);
  const y1 = 1 + PAD;
  // prettier-ignore
  return new Float32Array([
    x0, y0,  x1, y0,  x1, y1,
    x0, y0,  x1, y1,  x0, y1,
  ]);
}

export class LotusRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private castProg: WebGLProgram; // same VS, height-output FS
  private vao: WebGLVertexArrayObject;
  private castVao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private quadCount: number;
  private resLoc: WebGLUniformLocation;
  private scrollLoc: WebGLUniformLocation;
  private castResLoc: WebGLUniformLocation;
  private castScrollLoc: WebGLUniformLocation;
  private castHeightLoc: WebGLUniformLocation;
  private castOffsetLoc: WebGLUniformLocation;
  private offsetLoc: WebGLUniformLocation; // visible prog: zeroed each draw (shares cast VS)
  private themeLoc: WebGLUniformLocation; // 0 = dark, 1 = light; eased by caller
  private bulgeLoc: WebGLUniformLocation; // squircle blend: 0 triangle, 1 circle
  private themeMix = 1;
  // Production value matches the const this shader used to bake in; figures
  // (lotus-petal-mix) drive it from a slider via setBulge().
  private bulge = 0.55;
  private capacityFloats = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.castProg = createProgram(gl, VS, CAST_FS);
    this.resLoc = gl.getUniformLocation(this.prog, "u_res")!;
    this.scrollLoc = gl.getUniformLocation(this.prog, "u_scroll")!;
    this.castResLoc = gl.getUniformLocation(this.castProg, "u_res")!;
    this.castScrollLoc = gl.getUniformLocation(this.castProg, "u_scroll")!;
    this.castHeightLoc = gl.getUniformLocation(this.castProg, "u_castHeight")!;
    this.castOffsetLoc =
      gl.getUniformLocation(this.castProg, "u_castOffset")!;
    this.offsetLoc = gl.getUniformLocation(this.prog, "u_castOffset")!;
    this.themeLoc = gl.getUniformLocation(this.prog, "u_theme")!;
    this.bulgeLoc = gl.getUniformLocation(this.prog, "u_bulge")!;

    const quad = petalQuad();
    this.quadCount = quad.length / 2;
    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    this.instVbo = gl.createBuffer()!;

    this.vao = this.makeVao(this.prog);
    this.castVao = this.makeVao(this.castProg);
  }

  private makeVao(prog: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    const aUnit = gl.getAttribLocation(prog, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    bindInstancedFloatAttribs(gl, prog, [
      ["i_center", 2],
      ["i_angle", 1],
      ["i_len", 1],
      ["i_half", 1],
      ["i_inner", 1],
      ["i_color", 3],
      ["i_colorDark", 3],
      ["i_seed", 1],
    ]);
    gl.bindVertexArray(null);
    return vao;
  }

  // 0 = dark pond, 1 = light pond. The caller eases this so the petal
  // palette cross-fades smoothly when the site theme toggles.
  setTheme(mix: number): void {
    this.themeMix = mix;
  }

  // Petal SDF blend: 0 = sharp triangle, 1 = full circle (used by the
  // lotus-petal-mix figure to morph the petal in real time).
  setBulge(v: number): void {
    this.bulge = v;
  }

  private upload(data: Float32Array, count: number) {
    const gl = this.gl;
    const floats = count * LOTUS_INST_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    if (floats > this.capacityFloats) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this.capacityFloats = floats;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floats);
    }
  }

  // Caster pass: real petal shape into the bound height mask. No-blend /
  // no-depth state is set by ShadowRenderer.begin().
  // `shadowScale` (default 1) — see LilypadRenderer.cast for the contract.
  cast(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll: number,
    shadowScale: number = 1,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    this.upload(data, count);
    gl.useProgram(this.castProg);
    const [mxRaw, myRaw] = shadowMargin();
    const mx = mxRaw * shadowScale;
    const my = myRaw * shadowScale;
    gl.uniform2f(this.castResLoc, width + 2 * mx, height + my);
    gl.uniform1f(this.castScrollLoc, scroll);
    gl.uniform1f(this.castHeightLoc, LOTUS_H);
    const off = castShadowOffset(LOTUS_H, this.themeMix);
    // +mx folds in the X origin shift (mask grown both sides for the mirrored sun).
    gl.uniform2f(
      this.castOffsetLoc,
      off[0] * shadowScale + mx,
      off[1] * shadowScale,
    );
    gl.bindVertexArray(this.castVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.quadCount, count);
    gl.bindVertexArray(null);
  }

  // Must be drawn after the water composite so the flowers sit on top.
  draw(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll = 0,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    this.upload(data, count);
    gl.useProgram(this.prog);
    gl.uniform2f(this.resLoc, width, height);
    gl.uniform1f(this.scrollLoc, scroll);
    gl.uniform2f(this.offsetLoc, 0, 0); // no cast offset on visible draws
    gl.uniform1f(this.themeLoc, this.themeMix);
    gl.uniform1f(this.bulgeLoc, this.bulge);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.quadCount, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.castProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.castVao);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.instVbo);
  }
}
