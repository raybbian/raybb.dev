import { createProgram } from "@/lib/gl";
import type { FigureModule, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import {
  DEEP_DARK,
  RIPPLE_CREST,
  SHEEN,
} from "@/render/WaterRenderer";
import { BG_DARK } from "@/render/frame";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { hslToRgb } from "@/sim/koiPattern";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/waterRefract.frag.glsl";

// Single lily, offset to the upper-left so its ripple band reaches well into
// the striped rectangle (which spans most of the panel).
const LILY_NX = 0.22;
const LILY_NY = 0.40;
const LILY_R_FRAC = 0.22; // panel-height fraction
const LILY_NOTCH = 0.18;  // rad
const LILY_ROT = 0.7;     // rad
const LILY_SEED = 2.4;
const LILY_HSL: [number, number, number] = [0.32, 0.5, 0.36];

class WaterRefractSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private lily: LilypadRenderer;
  private prog: WebGLProgram;
  private uScene: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uLily: WebGLUniformLocation;
  private uLilyNotch: WebGLUniformLocation;
  private uLilySeed: WebGLUniformLocation;
  private uBg: WebGLUniformLocation;
  private uDeep: WebGLUniformLocation;
  private uSheen: WebGLUniformLocation;
  private uRippleCrest: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;

  // Offscreen scene capture: just the lily, on transparent bg.
  private fbo: WebGLFramebuffer;
  private sceneTex: WebGLTexture;
  private fboW = 0;
  private fboH = 0;
  // 1x1 zero shadow texture (RGBA8) — shadowHit() returns 0 everywhere when
  // G == 0, so the lily renders without a cast-shadow contribution.
  private shadowTex: WebGLTexture;

  private w = 0;
  private h = 0;
  private time = 0;

  private lilyX = 0;
  private lilyY = 0;
  private lilyR = 0;
  private lilyInst = new Float32Array(LILYPAD_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.lily = new LilypadRenderer(gl);
    this.prog = createProgram(gl, VS, FS);
    this.uScene = gl.getUniformLocation(this.prog, "u_scene")!;
    this.uRes = gl.getUniformLocation(this.prog, "u_res")!;
    this.uTime = gl.getUniformLocation(this.prog, "u_time")!;
    this.uLily = gl.getUniformLocation(this.prog, "u_lily")!;
    this.uLilyNotch = gl.getUniformLocation(this.prog, "u_lilyNotch")!;
    this.uLilySeed = gl.getUniformLocation(this.prog, "u_lilySeed")!;
    this.uBg = gl.getUniformLocation(this.prog, "u_bg")!;
    this.uDeep = gl.getUniformLocation(this.prog, "u_deep")!;
    this.uSheen = gl.getUniformLocation(this.prog, "u_sheen")!;
    this.uRippleCrest = gl.getUniformLocation(this.prog, "u_rippleCrest")!;
    this.vao = gl.createVertexArray()!;

    this.fbo = gl.createFramebuffer()!;
    this.sceneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.shadowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setTheme() {}

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;

    this.lilyX = w * LILY_NX;
    this.lilyY = h * LILY_NY;
    this.lilyR = h * LILY_R_FRAC;
    const c = hslToRgb(LILY_HSL[0], LILY_HSL[1], LILY_HSL[2]);
    this.lilyInst.set([
      this.lilyX, this.lilyY, this.lilyR, LILY_ROT, LILY_NOTCH, LILY_SEED,
      c[0], c[1], c[2],
    ]);

    const fw = Math.max(1, Math.round(w * dpr));
    const fh = Math.max(1, Math.round(h * dpr));
    if (fw !== this.fboW || fh !== this.fboH) {
      this.fboW = fw;
      this.fboH = fh;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to the
    // default fb.
    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Render the lily into the offscreen FBO (transparent bg).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.fboW, this.fboH);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.lily.draw(
      this.lilyInst, 1, w, h, 0,
      this.shadowTex, this.fboW, this.fboH,
    );

    // 2) Composite back into the framework's viewport on the default fb.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform2f(this.uRes, w, h);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform4f(this.uLily, this.lilyX, this.lilyY, this.lilyR, LILY_ROT);
    gl.uniform1f(this.uLilyNotch, LILY_NOTCH);
    gl.uniform1f(this.uLilySeed, LILY_SEED);
    // Pond palette — same constants the production water shader reads.
    gl.uniform3f(this.uBg, BG_DARK[0], BG_DARK[1], BG_DARK[2]);
    gl.uniform3f(this.uDeep, DEEP_DARK[0], DEEP_DARK[1], DEEP_DARK[2]);
    gl.uniform1f(this.uSheen, SHEEN);
    gl.uniform1f(this.uRippleCrest, RIPPLE_CREST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    this.lily.dispose();
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.shadowTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new WaterRefractSketch(host.gl);
  },
};

export default mod;
