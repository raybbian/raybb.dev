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
import VS from "@/render/shaders/lilypad.vert.glsl";
import FS from "@/render/shaders/lilypad.frag.glsl";
import CAST_FS from "@/render/shaders/lilypad.shadow.frag.glsl";
import WIRE_FS from "@/render/shaders/lilypad.wire.frag.glsl";
import { bindNoiseUniform } from "@/render/noiseTexture";

const CIRCLE_SEG = 64;

// Triangle-fan edges for the unit-circle mesh: per triangle (3i, 3i+1, 3i+2)
// emit lines (origin->rimA, rimA->rimB, rimB->origin). Adjacent triangles
// share their spoke; drawing those edges twice is cheaper than de-duping and
// visually identical. Indices stay in [0, 3*segments).
function lilypadWireIndices(segments: number): Uint16Array {
  const out = new Uint16Array(segments * 6);
  let o = 0;
  for (let i = 0; i < segments; i++) {
    const a = i * 3, b = a + 1, c = a + 2;
    out[o++] = a; out[o++] = b;
    out[o++] = b; out[o++] = c;
    out[o++] = c; out[o++] = a;
  }
  return out;
}

export class LilypadRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private castProg: WebGLProgram; // same VS, height-output FS
  private wireProg: WebGLProgram; // same VS, flat-line FS (figures only)
  private vao: WebGLVertexArrayObject;
  private castVao: WebGLVertexArrayObject;
  private wireVao: WebGLVertexArrayObject;
  private circleVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private wireIbo: WebGLBuffer;
  private circleCount: number;
  private wireIndexCount: number;
  private resLoc: WebGLUniformLocation;
  private scrollLoc: WebGLUniformLocation;
  private castResLoc: WebGLUniformLocation;
  private castScrollLoc: WebGLUniformLocation;
  private castHeightLoc: WebGLUniformLocation;
  private castOffsetLoc: WebGLUniformLocation;
  private offsetLoc: WebGLUniformLocation; // visible prog: zeroed each draw (shares cast VS)
  private wireResLoc: WebGLUniformLocation;
  private wireScrollLoc: WebGLUniformLocation;
  private wireOffsetLoc: WebGLUniformLocation;
  private wireColorLoc: WebGLUniformLocation;
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
  // Lazily allocated 1×1 zero texture used when callers (figures) don't have
  // a real shadow mask to pass in. RGBA = (0,0,0,0) makes shadowHit() return
  // 0 everywhere, so the lily renders with no cast-shadow contribution.
  private dummyShadow: WebGLTexture | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.castProg = createProgram(gl, VS, CAST_FS);
    this.wireProg = createProgram(gl, VS, WIRE_FS);
    this.resLoc = gl.getUniformLocation(this.prog, "u_res")!;
    this.scrollLoc = gl.getUniformLocation(this.prog, "u_scroll")!;
    this.castResLoc = gl.getUniformLocation(this.castProg, "u_res")!;
    this.castScrollLoc = gl.getUniformLocation(this.castProg, "u_scroll")!;
    this.castHeightLoc = gl.getUniformLocation(this.castProg, "u_castHeight")!;
    this.castOffsetLoc =
      gl.getUniformLocation(this.castProg, "u_castOffset")!;
    this.offsetLoc = gl.getUniformLocation(this.prog, "u_castOffset")!;
    this.wireResLoc = gl.getUniformLocation(this.wireProg, "u_res")!;
    this.wireScrollLoc = gl.getUniformLocation(this.wireProg, "u_scroll")!;
    this.wireOffsetLoc = gl.getUniformLocation(this.wireProg, "u_castOffset")!;
    this.wireColorLoc = gl.getUniformLocation(this.wireProg, "u_wireColor")!;
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
    // No-op if u_noise was optimized out (lilypad uses shadowHit, not the
    // FBM wavy variants); kept for shadow.glsl include consistency.
    bindNoiseUniform(gl, this.prog);

    const circle = unitCircleMesh(CIRCLE_SEG);
    this.circleCount = circle.length / 2;
    this.circleVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, circle, gl.STATIC_DRAW);
    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);

    const wireIdx = lilypadWireIndices(CIRCLE_SEG);
    this.wireIndexCount = wireIdx.length;
    this.wireIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIdx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    this.vao = this.makeVao(this.prog);
    this.castVao = this.makeVao(this.castProg);
    this.wireVao = this.makeVao(this.wireProg);
    // Bind the line index buffer into the wire VAO so drawElements picks it up.
    gl.bindVertexArray(this.wireVao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireIbo);
    gl.bindVertexArray(null);
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
  // `shadowScale` (default 1) — figures pass `figureSceneRatio(width)` so the
  // pre-shift (and the matching FBO margin baked into ShadowRenderer.resize)
  // shrinks to hold a constant fraction of canvas. Receiver shader must
  // upload the SAME scaled K / margin or the shadow lands off-target.
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
    gl.uniform1f(this.castHeightLoc, LILYPAD_H);
    const off = castShadowOffset(LILYPAD_H, this.themeMix);
    // +mx folds in the X origin shift (mask grown both sides for the mirrored sun).
    gl.uniform2f(
      this.castOffsetLoc,
      off[0] * shadowScale + mx,
      off[1] * shadowScale,
    );
    gl.bindVertexArray(this.castVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
    gl.bindVertexArray(null);
  }

  private getDummyShadow(): WebGLTexture {
    if (this.dummyShadow) return this.dummyShadow;
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.dummyShadow = tex;
    return tex;
  }

  // Visible pass; also receives shadows (lotuses cast onto the pads).
  // `shadowTex`/`fragW`/`fragH` are optional: figures that don't run a
  // shadow pass omit them and the renderer binds a 1×1 zero texture so
  // shadowHit() returns 0 everywhere.
  draw(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll: number,
    shadowTex?: WebGLTexture,
    fragW?: number,
    fragH?: number,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    const tex = shadowTex ?? this.getDummyShadow();
    const fw = fragW ?? width;
    const fh = fragH ?? height;
    this.upload(data, count);
    gl.useProgram(this.prog);
    gl.uniform2f(this.resLoc, width, height);
    gl.uniform1f(this.scrollLoc, scroll);
    gl.uniform2f(this.sh.fragRes, fw, fh);
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
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.sh.tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // Figure-only: render the triangle-fan mesh as lines, with the same notch
  // carve as the visible pass so removed wedges drop out. No shadow uniforms,
  // no blending toggle dance — figures handle GL state themselves.
  drawWires(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll: number,
    color: [number, number, number, number],
  ) {
    if (count === 0) return;
    const gl = this.gl;
    this.upload(data, count);
    gl.useProgram(this.wireProg);
    gl.uniform2f(this.wireResLoc, width, height);
    gl.uniform1f(this.wireScrollLoc, scroll);
    gl.uniform2f(this.wireOffsetLoc, 0, 0);
    gl.uniform4f(this.wireColorLoc, color[0], color[1], color[2], color[3]);
    gl.bindVertexArray(this.wireVao);
    gl.drawElementsInstanced(
      gl.LINES,
      this.wireIndexCount,
      gl.UNSIGNED_SHORT,
      0,
      count,
    );
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.castProg);
    gl.deleteProgram(this.wireProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.castVao);
    gl.deleteVertexArray(this.wireVao);
    gl.deleteBuffer(this.circleVbo);
    gl.deleteBuffer(this.instVbo);
    gl.deleteBuffer(this.wireIbo);
    if (this.dummyShadow) gl.deleteTexture(this.dummyShadow);
  }
}
