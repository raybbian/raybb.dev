import { createProgram, OffscreenTarget } from "@/lib/gl";
import type { FigureModule, FigureTheme, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import {
  DEEP_DARK,
  DEEP_LIGHT,
  RIPPLE_CREST,
  SHEEN,
} from "@/render/WaterRenderer";
import { BG_DARK, BG_LIGHT } from "@/render/frame";
import { ThemeMixer, lerpRgb } from "@/figures/theme";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { hslToRgb } from "@/sim/koiPattern";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/waterRefract.frag.glsl";

// Single lily, offset to the upper-left so its ripple band reaches well into
// the striped rectangle (which spans most of the panel). Smaller than the
// canonical FIGURE_LILY_R_FRAC so the refraction band has room to fall
// outside the pad edge.
const LILY_NX = 0.22;
const LILY_NY = 0.40;
const LILY_R_FRAC = 0.22;
const LILY_NOTCH = 0.18;  // rad
const LILY_ROT = 0.7;     // rad
const LILY_SEED = 2.4;
const LILY_RGB = hslToRgb(0.32, 0.5, 0.36);

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
  private scene: OffscreenTarget;

  private w = 0;
  private h = 0;
  private time = 0;
  private lastT: number | null = null;
  private theme: ThemeMixer;

  private lilyX = 0;
  private lilyY = 0;
  private lilyR = 0;
  private lilyInst = new Float32Array(LILYPAD_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.lily = new LilypadRenderer(gl);
    this.theme = new ThemeMixer(theme);
    // Snap to the initial mix so first paint is settled.
    this.lily.setTheme(this.theme.mix);
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
    this.scene = new OffscreenTarget(gl);
  }

  setTheme(theme: FigureTheme) {
    this.theme.setTarget(theme);
  }

  resize(w: number, h: number, dpr: number, _screenScale: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;

    this.lilyX = w * LILY_NX;
    this.lilyY = h * LILY_NY;
    this.lilyR = h * LILY_R_FRAC;
    this.lilyInst.set([
      this.lilyX, this.lilyY, this.lilyR, LILY_ROT, LILY_NOTCH, LILY_SEED,
      LILY_RGB[0], LILY_RGB[1], LILY_RGB[2],
    ]);

    this.scene.resize(
      Math.max(1, Math.round(w * dpr)),
      Math.max(1, Math.round(h * dpr)),
    );
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;

    // Ease the pond palette toward the active theme (~250ms) so a toggle
    // fades the water/lily in lockstep with the CSS frost transition.
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    if (this.theme.advance(dt)) this.lily.setTheme(this.theme.mix);
    const bg = lerpRgb(BG_DARK, BG_LIGHT, this.theme.mix);
    const deep = lerpRgb(DEEP_DARK, DEEP_LIGHT, this.theme.mix);

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to the
    // default fb.
    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Render the lily into the offscreen FBO (transparent bg).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.lily.draw(this.lilyInst, 1, w, h, 0);

    // 2) Composite back into the framework's viewport on the default fb.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform2f(this.uRes, w, h);
    gl.uniform1f(this.uTime, this.time);
    gl.uniform4f(this.uLily, this.lilyX, this.lilyY, this.lilyR, LILY_ROT);
    gl.uniform1f(this.uLilyNotch, LILY_NOTCH);
    gl.uniform1f(this.uLilySeed, LILY_SEED);
    // Pond palette — eased between dark/light per current theme.
    gl.uniform3f(this.uBg, bg[0], bg[1], bg[2]);
    gl.uniform3f(this.uDeep, deep[0], deep[1], deep[2]);
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
    this.scene.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new WaterRefractSketch(host.gl, theme);
  },
};

export default mod;
