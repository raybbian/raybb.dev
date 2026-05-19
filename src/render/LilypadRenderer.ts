import {
  bindInstancedFloatAttribs,
  createProgram,
  unitCircleMesh,
} from "@/lib/gl";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import {
  LILYPAD_H,
  SHADOW_BIAS,
  SHADOW_DARKNESS,
  SHADOW_FADE,
  SHADOW_K,
  castShadowOffset,
  shadowMargin,
  shadowSunDir,
} from "@/render/ShadowRenderer";
import VS from "@/shaders/lilypad.vert.glsl";
import FS from "@/shaders/lilypad.frag.glsl";
import CAST_FS from "@/shaders/lilypad.shadow.frag.glsl";

const CIRCLE_SEG = 64;

export class LilypadRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private castProg: WebGLProgram; // same VS, height-output FS
  private vao: WebGLVertexArrayObject;
  private castVao: WebGLVertexArrayObject;
  private circleVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private circleCount: number;
  private resLoc: WebGLUniformLocation;
  private scrollLoc: WebGLUniformLocation;
  private castResLoc: WebGLUniformLocation;
  private castScrollLoc: WebGLUniformLocation;
  private castHeightLoc: WebGLUniformLocation;
  private castOffsetLoc: WebGLUniformLocation;
  private offsetLoc: WebGLUniformLocation; // visible prog: zeroed each draw (shares cast VS)
  private sh: {
    tex: WebGLUniformLocation;
    fragRes: WebGLUniformLocation;
    sunDir: WebGLUniformLocation;
    k: WebGLUniformLocation;
    dark: WebGLUniformLocation;
    bias: WebGLUniformLocation;
    fade: WebGLUniformLocation;
    recv: WebGLUniformLocation;
    margin: WebGLUniformLocation;
  };
  private themeMix = 1; // 0 = dark, 1 = light; eased by the caller
  private capacityFloats = 0; // instVbo size, grown on demand

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
    const u = (n: string) => gl.getUniformLocation(this.prog, n)!;
    this.sh = {
      tex: u("u_shadow"),
      fragRes: u("u_fragRes"),
      sunDir: u("u_sunDir"),
      k: u("u_shadowK"),
      dark: u("u_shadowDark"),
      bias: u("u_shadowBias"),
      fade: u("u_shadowFade"),
      recv: u("u_recvHeight"),
      margin: u("u_shadowMargin"),
    };

    const circle = unitCircleMesh(CIRCLE_SEG);
    this.circleCount = circle.length / 2;
    this.circleVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, circle, gl.STATIC_DRAW);
    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);

    this.vao = this.makeVao(this.prog);
    this.castVao = this.makeVao(this.castProg);
  }

  // Binds the shared buffers for `prog`'s own attribute locations (color and
  // cast programs may differ).
  private makeVao(prog: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    const aUnit = gl.getAttribLocation(prog, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    bindInstancedFloatAttribs(gl, prog, [
      ["i_center", 2],
      ["i_radius", 1],
      ["i_rot", 1],
      ["i_notch", 1],
      ["i_seed", 1],
      ["i_color", 3],
    ]);
    gl.bindVertexArray(null);
    return vao;
  }

  private upload(data: Float32Array, count: number) {
    const gl = this.gl;
    const floats = count * LILYPAD_INST_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    if (floats > this.capacityFloats) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this.capacityFloats = floats;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floats);
    }
  }

  // 0 = dark pond, 1 = light pond. Eased by the caller so the cast offset and
  // the receiver's sun lookup mirror in lockstep when the theme toggles.
  setTheme(mix: number): void {
    this.themeMix = mix;
  }

  // Caster pass: real pad outline (notch carved) into the bound height mask.
  // No-blend / no-depth state is set by ShadowRenderer.begin().
  cast(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll: number,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    this.upload(data, count);
    gl.useProgram(this.castProg);
    const [mx, my] = shadowMargin();
    gl.uniform2f(this.castResLoc, width + 2 * mx, height + my);
    gl.uniform1f(this.castScrollLoc, scroll);
    gl.uniform1f(this.castHeightLoc, LILYPAD_H);
    const off = castShadowOffset(LILYPAD_H, this.themeMix);
    // +mx folds in the X origin shift (mask grown both sides for the mirrored sun).
    gl.uniform2f(this.castOffsetLoc, off[0] + mx, off[1]);
    gl.bindVertexArray(this.castVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
    gl.bindVertexArray(null);
  }

  // Visible pass; also receives shadows (lotuses cast onto the pads).
  draw(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll: number,
    shadowTex: WebGLTexture,
    fragW: number,
    fragH: number,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    this.upload(data, count);
    gl.useProgram(this.prog);
    gl.uniform2f(this.resLoc, width, height);
    gl.uniform1f(this.scrollLoc, scroll);
    gl.uniform2f(this.sh.fragRes, fragW, fragH);
    const sd = shadowSunDir(this.themeMix);
    gl.uniform2f(this.sh.sunDir, sd[0], sd[1]);
    const [mx, my] = shadowMargin();
    gl.uniform2f(this.sh.margin, mx, my);
    gl.uniform1f(this.sh.k, SHADOW_K);
    gl.uniform1f(this.sh.dark, SHADOW_DARKNESS);
    gl.uniform1f(this.sh.bias, SHADOW_BIAS);
    gl.uniform1f(this.sh.fade, SHADOW_FADE);
    gl.uniform1f(this.sh.recv, LILYPAD_H);
    gl.uniform2f(this.offsetLoc, 0, 0); // no cast offset on visible draws
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(this.sh.tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.castProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.castVao);
    gl.deleteBuffer(this.circleVbo);
    gl.deleteBuffer(this.instVbo);
  }
}
