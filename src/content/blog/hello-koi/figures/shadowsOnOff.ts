import { createProgram, OffscreenTarget } from "@/lib/gl";
import type { FigureModule, FigureTheme, PointerInfo, Sketch } from "@/figures/types";
import { RIPPLE_CREST, SHEEN } from "@/render/WaterRenderer";
import {
  ShadowRenderer,
  SHADOW_BIAS,
  SHADOW_DARKNESS,
  SHADOW_FADE,
  SHADOW_K,
  WATER_H,
  shadowMargin,
  shadowSunDir,
} from "@/render/ShadowRenderer";
import {
  bindNoiseUniform,
  buildNoiseTexture,
  NOISE_TEX_UNIT,
} from "@/render/noiseTexture";
import { LilyLotusFigureScene } from "@/figures/lilyLotusFigureScene";
import { WiperState } from "@/figures/wiper";
import { PALETTE as P } from "@/figures/palette";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/shadowsOnOff.frag.glsl";

const SHADOW_TEX_UNIT = 2;

class ShadowsOnOffSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private scene: LilyLotusFigureScene;
  private shadow: ShadowRenderer;
  private prog: WebGLProgram;
  private u: {
    scene: WebGLUniformLocation;
    res: WebGLUniformLocation;
    time: WebGLUniformLocation;
    wiper: WebGLUniformLocation;
    bg: WebGLUniformLocation;
    deep: WebGLUniformLocation;
    sheen: WebGLUniformLocation;
    rippleCrest: WebGLUniformLocation;
    diskCount: WebGLUniformLocation;
    disks: WebGLUniformLocation;
    notch: WebGLUniformLocation;
    seed: WebGLUniformLocation;
    handleDot: WebGLUniformLocation;
    shadow: WebGLUniformLocation;
    sunDir: WebGLUniformLocation;
    shadowMargin: WebGLUniformLocation;
    shadowK: WebGLUniformLocation;
    shadowDark: WebGLUniformLocation;
    shadowBias: WebGLUniformLocation;
    shadowFade: WebGLUniformLocation;
    recvHeight: WebGLUniformLocation;
    surfaceH: WebGLUniformLocation;
    shadowDebug: WebGLUniformLocation | null;
  };
  private vao: WebGLVertexArrayObject;
  private sceneFbo: OffscreenTarget;
  private noiseTex: WebGLTexture;

  private w = 0;
  private h = 0;
  private time = 0;
  private wiper = new WiperState();

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.scene = new LilyLotusFigureScene(gl, theme);
    this.shadow = new ShadowRenderer(gl);
    this.prog = createProgram(gl, VS, FS);
    const u = (name: string) => gl.getUniformLocation(this.prog, name)!;
    this.u = {
      scene: u("u_scene"),
      res: u("u_res"),
      time: u("u_time"),
      wiper: u("u_wiper"),
      bg: u("u_bg"),
      deep: u("u_deep"),
      sheen: u("u_sheen"),
      rippleCrest: u("u_rippleCrest"),
      diskCount: u("u_diskCount"),
      disks: u("u_disks"),
      notch: u("u_notch"),
      seed: u("u_seed"),
      handleDot: u("u_handleDot"),
      shadow: u("u_shadow"),
      sunDir: u("u_sunDir"),
      shadowMargin: u("u_shadowMargin"),
      shadowK: u("u_shadowK"),
      shadowDark: u("u_shadowDark"),
      shadowBias: u("u_shadowBias"),
      shadowFade: u("u_shadowFade"),
      recvHeight: u("u_recvHeight"),
      surfaceH: u("u_surfaceH"),
      // Only present if the include's debug helpers ever get called; the
      // compiler may have stripped it. Optional so getUniformLocation==null
      // doesn't crash startup.
      shadowDebug: gl.getUniformLocation(this.prog, "u_shadowDebug"),
    };
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

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.scene.resize(w, h);
    const px = Math.max(1, Math.round(w * dpr));
    const py = Math.max(1, Math.round(h * dpr));
    this.sceneFbo.resize(px, py);
    // ShadowRenderer auto-pads by shadowMargin() so the cast pass never
    // clamps — same convention the production pond uses.
    this.shadow.resize(px, py, dpr);
  }

  pointer(p: PointerInfo) {
    this.wiper.pointer(p, this.w);
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;

    const { bg, deep } = this.scene.frame(t);
    const themeMix = this.scene.themeMix;

    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    // 1) Caster pass: bake lily + lotus heights into the shadow mask.
    this.shadow.begin();
    this.scene.castShadows();
    this.shadow.end();

    // 2) Visible pass: lily + lotus on transparent bg into the offscreen FBO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo.fbo);
    gl.viewport(0, 0, this.sceneFbo.width, this.sceneFbo.height);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.scene.drawScene();

    // 3) Composite: water + foam, with the shadow side darkened by the
    // heightmap (sampled via shadowHit inside the shader).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo.tex);
    gl.uniform1i(this.u.scene, 0);
    gl.activeTexture(gl.TEXTURE0 + SHADOW_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
    gl.uniform1i(this.u.shadow, SHADOW_TEX_UNIT);
    gl.activeTexture(gl.TEXTURE0);

    gl.uniform2f(this.u.res, w, h);
    gl.uniform1f(this.u.time, this.time);
    gl.uniform1f(this.u.wiper, this.wiper.value);
    gl.uniform3f(this.u.bg, bg[0], bg[1], bg[2]);
    gl.uniform3f(this.u.deep, deep[0], deep[1], deep[2]);
    gl.uniform1f(this.u.sheen, SHEEN);
    gl.uniform1f(this.u.rippleCrest, RIPPLE_CREST);
    gl.uniform1i(this.u.diskCount, this.scene.diskCount);
    gl.uniform4fv(this.u.disks, this.scene.diskBuf);
    gl.uniform1fv(this.u.notch, this.scene.notchBuf);
    gl.uniform1fv(this.u.seed, this.scene.seedBuf);
    gl.uniform3f(this.u.handleDot, P.accentGL[0], P.accentGL[1], P.accentGL[2]);

    // Shadow uniforms — identical to WaterRenderer.composite() so the
    // figure's heightmap sampling matches production frame-for-frame.
    const sd = shadowSunDir(themeMix);
    gl.uniform2f(this.u.sunDir, sd[0], sd[1]);
    const [mx, my] = shadowMargin();
    gl.uniform2f(this.u.shadowMargin, mx, my);
    gl.uniform1f(this.u.shadowK, SHADOW_K);
    gl.uniform1f(this.u.shadowDark, SHADOW_DARKNESS);
    gl.uniform1f(this.u.shadowBias, SHADOW_BIAS);
    gl.uniform1f(this.u.shadowFade, SHADOW_FADE);
    gl.uniform1f(this.u.recvHeight, WATER_H);
    gl.uniform1f(this.u.surfaceH, WATER_H);
    if (this.u.shadowDebug) gl.uniform1f(this.u.shadowDebug, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    this.scene.dispose();
    this.shadow.dispose();
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
    return new ShadowsOnOffSketch(host.gl, theme);
  },
};

export default mod;
