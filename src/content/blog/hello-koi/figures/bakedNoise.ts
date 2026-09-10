import { OffscreenTarget } from "@/lib/gl";
import type { FigureModule, FigureTheme, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import {
  bindNoiseUniform,
  buildNoiseTexture,
  NOISE_TEX_UNIT,
} from "@/render/noiseTexture";
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
import { PALETTE as P } from "@/figures/palette";
import FS from "./shaders/bakedNoise.frag.glsl";

// Lily placement mirrors the waterRefract figure so the two figures show
// the same scene. Slightly off-centre so the ripple band reaches well into
// the noise-side comparison when the wiper is dragged.
const LILY_NX = 0.22;
const LILY_NY = 0.40;
const LILY_R_FRAC = 0.22;
const LILY_NOTCH = 0.18;  // rad
const LILY_ROT = 0.7;     // rad
const LILY_SEED = 2.4;
const LILY_RGB = hslToRgb(0.32, 0.5, 0.36);

// Wiper comparison figure: drag to slide between (left) the production
// water refraction over stripes with a lilypad's ripple band on top, and
// (right) the raw baked noise texture that drives both the ambient refract
// and the lily's foam/crest width variation. The two halves use the same
// noise UV mapping, so a feature in the texture lines up 1:1 with the
// refraction it produces directly across the wiper.
class BakedNoiseSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private lily: LilypadRenderer;
  private shader: FullscreenShader;
  private noiseTex: WebGLTexture;
  private scene: OffscreenTarget;
  private uScene: WebGLUniformLocation | null;
  private uRes: WebGLUniformLocation | null;
  private uTime: WebGLUniformLocation | null;
  private uWiper: WebGLUniformLocation | null;
  private uLily: WebGLUniformLocation | null;
  private uLilyNotch: WebGLUniformLocation | null;
  private uLilySeed: WebGLUniformLocation | null;
  private uBg: WebGLUniformLocation | null;
  private uDeep: WebGLUniformLocation | null;
  private uSheen: WebGLUniformLocation | null;
  private uRippleCrest: WebGLUniformLocation | null;
  private uHandleDot: WebGLUniformLocation | null;

  private w = 0;
  private h = 0;
  private time = 0;
  private lastT: number | null = null;
  private wiper = 0.5;
  private dragging = false;
  private theme: ThemeMixer;

  private lilyX = 0;
  private lilyY = 0;
  private lilyR = 0;
  private lilyInst = new Float32Array(LILYPAD_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.lily = new LilypadRenderer(gl);
    this.shader = new FullscreenShader(gl, FS);
    this.theme = new ThemeMixer(theme);
    this.lily.setTheme(this.theme.mix);
    this.scene = new OffscreenTarget(gl);
    this.noiseTex = buildNoiseTexture(gl);
    gl.activeTexture(gl.TEXTURE0 + NOISE_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);
    bindNoiseUniform(gl, this.shader.program);
    this.uScene = this.shader.uniform("u_scene");
    this.uRes = this.shader.uniform("u_res");
    this.uTime = this.shader.uniform("u_time");
    this.uWiper = this.shader.uniform("u_wiper");
    this.uLily = this.shader.uniform("u_lily");
    this.uLilyNotch = this.shader.uniform("u_lilyNotch");
    this.uLilySeed = this.shader.uniform("u_lilySeed");
    this.uBg = this.shader.uniform("u_bg");
    this.uDeep = this.shader.uniform("u_deep");
    this.uSheen = this.shader.uniform("u_sheen");
    this.uRippleCrest = this.shader.uniform("u_rippleCrest");
    this.uHandleDot = this.shader.uniform("u_handleDot");
  }

  setTheme(theme: FigureTheme) {
    this.theme.setTarget(theme);
  }

  resize({ w, h, scale: unitPx, dpr }: FigureView) {
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
      Math.max(1, Math.round(w * unitPx * dpr)),
      Math.max(1, Math.round(h * unitPx * dpr)),
    );
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.dragging = true;
      this.wiper = Math.min(Math.max(p.x / this.w, 0), 1);
    } else if (p.type === "move" && this.dragging) {
      this.wiper = Math.min(Math.max(p.x / this.w, 0), 1);
    } else if (p.type === "up") {
      this.dragging = false;
    }
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;
    // Theme palette eases between dark/light just like the production
    // pond, so the figure tints match whatever mode the page is in.
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    if (this.theme.advance(dt)) this.lily.setTheme(this.theme.mix);
    const bg = lerpRgb(BG_DARK, BG_LIGHT, this.theme.mix);
    const deep = lerpRgb(DEEP_DARK, DEEP_LIGHT, this.theme.mix);

    // The framework's viewport may be letterboxed inside a larger canvas
    // (Figure.tsx `place()`), so restore it exactly when we go back to
    // the default fb — otherwise the composite stretches into the box.
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

    this.shader.draw(() => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      if (this.uScene) gl.uniform1i(this.uScene, 0);
      if (this.uRes) gl.uniform2f(this.uRes, w, h);
      if (this.uTime) gl.uniform1f(this.uTime, this.time);
      if (this.uWiper) gl.uniform1f(this.uWiper, this.wiper);
      if (this.uLily) gl.uniform4f(this.uLily, this.lilyX, this.lilyY, this.lilyR, LILY_ROT);
      if (this.uLilyNotch) gl.uniform1f(this.uLilyNotch, LILY_NOTCH);
      if (this.uLilySeed) gl.uniform1f(this.uLilySeed, LILY_SEED);
      if (this.uBg) gl.uniform3f(this.uBg, bg[0], bg[1], bg[2]);
      if (this.uDeep) gl.uniform3f(this.uDeep, deep[0], deep[1], deep[2]);
      if (this.uSheen) gl.uniform1f(this.uSheen, SHEEN);
      if (this.uRippleCrest) gl.uniform1f(this.uRippleCrest, RIPPLE_CREST);
      if (this.uHandleDot)
        gl.uniform3f(this.uHandleDot, P.accentGL[0], P.accentGL[1], P.accentGL[2]);
    });
  }

  dispose() {
    const gl = this.gl;
    this.lily.dispose();
    this.shader.dispose();
    this.scene.dispose();
    gl.deleteTexture(this.noiseTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new BakedNoiseSketch(host.gl, theme);
  },
};

export default mod;
