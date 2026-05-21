import { createProgram, OffscreenTarget } from "@/lib/gl";
import type { FigureModule, FigureTheme, PointerInfo, Sketch } from "@/figures/types";
import { RIPPLE_CREST, SHEEN } from "@/render/WaterRenderer";
import {
  bindNoiseUniform,
  buildNoiseTexture,
  NOISE_TEX_UNIT,
} from "@/render/noiseTexture";
import { LilyLotusFigureScene } from "@/figures/lilyLotusFigureScene";
import { WiperState } from "@/figures/wiper";
import { PALETTE as P } from "@/figures/palette";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/flatVsToon.frag.glsl";

class FlatVsToonSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private scene: LilyLotusFigureScene;
  private prog: WebGLProgram;
  private uScene: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uWiper: WebGLUniformLocation;
  private uBg: WebGLUniformLocation;
  private uDeep: WebGLUniformLocation;
  private uSheen: WebGLUniformLocation;
  private uRippleCrest: WebGLUniformLocation;
  private uDiskCount: WebGLUniformLocation;
  private uDisks: WebGLUniformLocation;
  private uNotch: WebGLUniformLocation;
  private uSeed: WebGLUniformLocation;
  private uHandleDot: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;
  private sceneFbo: OffscreenTarget;
  // Shared baked noise (RG = curl, B = scalar FBM). Bound on the reserved
  // unit so foam + crest sample exactly what production rippleMask.frag.glsl
  // sees at runtime.
  private noiseTex: WebGLTexture;

  private w = 0;
  private h = 0;
  private time = 0;
  private wiper = new WiperState();

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.scene = new LilyLotusFigureScene(gl, theme);
    this.prog = createProgram(gl, VS, FS);
    this.uScene = gl.getUniformLocation(this.prog, "u_scene")!;
    this.uRes = gl.getUniformLocation(this.prog, "u_res")!;
    this.uTime = gl.getUniformLocation(this.prog, "u_time")!;
    this.uWiper = gl.getUniformLocation(this.prog, "u_wiper")!;
    this.uBg = gl.getUniformLocation(this.prog, "u_bg")!;
    this.uDeep = gl.getUniformLocation(this.prog, "u_deep")!;
    this.uSheen = gl.getUniformLocation(this.prog, "u_sheen")!;
    this.uRippleCrest = gl.getUniformLocation(this.prog, "u_rippleCrest")!;
    this.uDiskCount = gl.getUniformLocation(this.prog, "u_diskCount")!;
    this.uDisks = gl.getUniformLocation(this.prog, "u_disks")!;
    this.uNotch = gl.getUniformLocation(this.prog, "u_notch")!;
    this.uSeed = gl.getUniformLocation(this.prog, "u_seed")!;
    this.uHandleDot = gl.getUniformLocation(this.prog, "u_handleDot")!;
    this.vao = gl.createVertexArray()!;
    this.sceneFbo = new OffscreenTarget(gl);
    this.noiseTex = buildNoiseTexture(gl);
    gl.activeTexture(gl.TEXTURE0 + NOISE_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);
    bindNoiseUniform(gl, this.prog);
  }

  setTheme(theme: FigureTheme) {
    this.scene.setTheme(theme);
  }

  resize(w: number, h: number, dpr: number, screenScale: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.scene.resize(w, h, screenScale);
    this.sceneFbo.resize(
      Math.max(1, Math.round(w * dpr)),
      Math.max(1, Math.round(h * dpr)),
    );
  }

  pointer(p: PointerInfo) {
    this.wiper.pointer(p, this.w);
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;

    const { bg, deep } = this.scene.frame(t);

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to the
    // default fb — otherwise the composite stretches into the letterbox.
    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Render lily + lotus into the offscreen FBO on transparent bg.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo.fbo);
    gl.viewport(0, 0, this.sceneFbo.width, this.sceneFbo.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.scene.drawScene();

    // 2) Composite back into the framework's viewport on the default fb.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo.tex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform2f(this.uRes, w, h);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform1f(this.uWiper, this.wiper.value);
    gl.uniform3f(this.uBg, bg[0], bg[1], bg[2]);
    gl.uniform3f(this.uDeep, deep[0], deep[1], deep[2]);
    gl.uniform1f(this.uSheen, SHEEN);
    gl.uniform1f(this.uRippleCrest, RIPPLE_CREST);
    gl.uniform1i(this.uDiskCount, this.scene.diskCount);
    gl.uniform4fv(this.uDisks, this.scene.diskBuf);
    gl.uniform1fv(this.uNotch, this.scene.notchBuf);
    gl.uniform1fv(this.uSeed, this.scene.seedBuf);
    gl.uniform3f(this.uHandleDot, P.accentGL[0], P.accentGL[1], P.accentGL[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    this.scene.dispose();
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    this.sceneFbo.dispose();
    gl.deleteTexture(this.noiseTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new FlatVsToonSketch(host.gl, theme);
  },
};

export default mod;
