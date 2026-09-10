import { createProgram } from "@/lib/gl";
import type { FigureModule, FigureTheme, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import {
  bindNoiseUniform,
  buildNoiseTexture,
  NOISE_TEX_UNIT,
} from "@/render/noiseTexture";
import { ThemeMixer, lerpRgb } from "@/figures/theme";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { BG_DARK, BG_LIGHT } from "@/render/frame";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { PALETTE as P } from "@/figures/palette";
import RIPPLE_VS from "@/render/shaders/ripple.vert.glsl";
import RIPPLE_MASK_FS from "@/render/shaders/rippleMask.frag.glsl";
import RIPPLE_DISP_FS from "@/render/shaders/rippleDisp.frag.glsl";
import VIS_FS from "./shaders/rippleTextures.frag.glsl";

// 8 floats per ripple instance: vec4 i_a (cx,cy,radius,rot) + vec4 i_b
// (notch,amp,foam,seed). Matches the production layout in WaterRenderer so we
// can feed the shipping ripple.vert.glsl unmodified.
const RIPPLE_INST_FLOATS = 8;
const TOTAL_LILIES = 4;

// Unit quad covering [-1, 1]^2 — same vertices the production WaterRenderer
// instances per ripple in its bake passes.
// prettier-ignore
const UNIT_QUAD = new Float32Array([
  -1, -1,   1, -1,   1, 1,
  -1, -1,   1,  1,  -1, 1,
]);

// Pad radius and gap range, expressed as fractions of panel height. Tuned so
// the ~50-px ripple bands (RIPPLE_BAND in ripple.vert.glsl) clearly interact
// at the min gap and clearly separate at the max gap, without the foam collars
// ever touching the rim of the canvas.
const LILY_R_FRAC = 0.17;
const LILY_NOTCH = 0.18;
const GAP_MIN_R = 2.15;
const GAP_MAX_R = 3.4;
const GAP_INIT_R = 2.55;

// Stable light-theme pad green — the renderer eases toward a dark variant
// itself when the theme switches, so we just pick one neutral mid-green.
const PAD_COLOR: [number, number, number] = [0.36, 0.58, 0.42];

// Distinct rotations + seeds per pad so foam-collar noise and crest phase
// don't lock-step between siblings (would hide the overlap signal).
const ROTS = [0.0, 1.7, 0.6, 2.4];
const SEEDS = [0.13, 2.91, 5.07, 1.42];

class RippleTexturesSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private lily: LilypadRenderer;
  private maskProg: WebGLProgram;
  private dispProg: WebGLProgram;
  private vis: FullscreenShader;
  private vao: WebGLVertexArrayObject;
  private quadVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private maskFbo: WebGLFramebuffer;
  private dispFbo: WebGLFramebuffer;
  private maskTex: WebGLTexture;
  private dispTex: WebGLTexture;
  private noiseTex: WebGLTexture;
  private uMaskRes: WebGLUniformLocation;
  private uMaskScale: WebGLUniformLocation;
  private uMaskTime: WebGLUniformLocation;
  private uDispRes: WebGLUniformLocation;
  private uDispScale: WebGLUniformLocation;
  private uDispTime: WebGLUniformLocation;
  private uVisMask: WebGLUniformLocation | null;
  private uVisDisp: WebGLUniformLocation | null;
  private uVisBg: WebGLUniformLocation | null;
  private theme: ThemeMixer;
  // RG16F + additive blending requires this extension. WaterRenderer logs the
  // same warning at startup; we degrade the disp side to background instead of
  // crashing.
  private floatBlend: boolean;

  private w = 0;
  private h = 0;
  private fboW = 0;
  private fboH = 0;
  private lilyR = 0;
  private gap = 0;
  private gapMin = 0;
  private gapMax = 0;
  private dragging = false;
  private lastPx = 0;

  private lilyInst = new Float32Array(TOTAL_LILIES * LILYPAD_INST_FLOATS);
  private rippleInst = new Float32Array(TOTAL_LILIES * RIPPLE_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.floatBlend = !!gl.getExtension("EXT_color_buffer_float");
    if (!this.floatBlend) {
      console.error(
        "rippleTextures: EXT_color_buffer_float missing; displacement side will read as background",
      );
    }
    this.lily = new LilypadRenderer(gl);
    this.theme = new ThemeMixer(theme);
    this.lily.setTheme(this.theme.mix);

    // Shared noise (curl + scalar FBM) on the reserved unit. rippleMask.frag
    // samples u_noise via waterNoise.glsl for foam-collar and crest-ring width
    // variation; without this binding the mask side renders garbage.
    this.noiseTex = buildNoiseTexture(gl);
    gl.activeTexture(gl.TEXTURE0 + NOISE_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);

    this.maskProg = createProgram(gl, RIPPLE_VS, RIPPLE_MASK_FS);
    this.dispProg = createProgram(gl, RIPPLE_VS, RIPPLE_DISP_FS);
    bindNoiseUniform(gl, this.maskProg);
    this.uMaskRes = gl.getUniformLocation(this.maskProg, "u_res")!;
    this.uMaskScale = gl.getUniformLocation(this.maskProg, "u_scale")!;
    this.uMaskTime = gl.getUniformLocation(this.maskProg, "u_time")!;
    this.uDispRes = gl.getUniformLocation(this.dispProg, "u_res")!;
    this.uDispScale = gl.getUniformLocation(this.dispProg, "u_scale")!;
    this.uDispTime = gl.getUniformLocation(this.dispProg, "u_time")!;

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);
    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      TOTAL_LILIES * RIPPLE_INST_FLOATS * 4,
      gl.DYNAMIC_DRAW,
    );
    // Shared VAO across both bake programs: ripple.vert.glsl pins (a_unit,
    // i_a, i_b) to explicit locations 0/1/2, so one layout serves both fs.
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    const stride = RIPPLE_INST_FLOATS * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    this.maskFbo = gl.createFramebuffer()!;
    this.dispFbo = gl.createFramebuffer()!;
    this.maskTex = gl.createTexture()!;
    this.dispTex = gl.createTexture()!;

    this.vis = new FullscreenShader(gl, VIS_FS);
    this.uVisMask = this.vis.uniform("u_mask");
    this.uVisDisp = this.vis.uniform("u_disp");
    this.uVisBg = this.vis.uniform("u_bg");
  }

  setTheme(theme: FigureTheme) {
    this.theme.setTarget(theme);
  }

  resize({ w, h, scale: unitPx, dpr }: FigureView) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    const fboW = Math.max(1, Math.round(w * unitPx * dpr));
    const fboH = Math.max(1, Math.round(h * unitPx * dpr));
    if (fboW !== this.fboW || fboH !== this.fboH) {
      this.fboW = fboW;
      this.fboH = fboH;
      this.allocFbos(fboW, fboH);
    }

    this.lilyR = h * LILY_R_FRAC;
    this.gapMin = this.lilyR * GAP_MIN_R;
    // Cap the max gap so the outer pad in each half never crosses the divider
    // or the canvas edge, regardless of aspect.
    const halfWidth = w * 0.5;
    this.gapMax = Math.min(
      this.lilyR * GAP_MAX_R,
      halfWidth - this.lilyR * 2.2,
    );
    if (this.gapMax < this.gapMin) this.gapMax = this.gapMin;
    if (this.gap === 0) this.gap = this.lilyR * GAP_INIT_R;
    this.gap = Math.min(Math.max(this.gap, this.gapMin), this.gapMax);
    this.buildInstances();
  }

  private allocFbos(w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTex, 0);

    if (this.floatBlend) {
      gl.bindTexture(gl.TEXTURE_2D, this.dispTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.dispTex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private buildInstances() {
    const { w, h, lilyR, gap } = this;
    const cy = h * 0.5;
    const xs = [
      w * 0.25 - gap * 0.5,
      w * 0.25 + gap * 0.5,
      w * 0.75 - gap * 0.5,
      w * 0.75 + gap * 0.5,
    ];
    for (let i = 0; i < TOTAL_LILIES; i++) {
      const li = i * LILYPAD_INST_FLOATS;
      this.lilyInst[li + 0] = xs[i];
      this.lilyInst[li + 1] = cy;
      this.lilyInst[li + 2] = lilyR;
      this.lilyInst[li + 3] = ROTS[i];
      this.lilyInst[li + 4] = LILY_NOTCH;
      this.lilyInst[li + 5] = SEEDS[i];
      this.lilyInst[li + 6] = PAD_COLOR[0];
      this.lilyInst[li + 7] = PAD_COLOR[1];
      this.lilyInst[li + 8] = PAD_COLOR[2];

      const ri = i * RIPPLE_INST_FLOATS;
      this.rippleInst[ri + 0] = xs[i];
      this.rippleInst[ri + 1] = cy;
      this.rippleInst[ri + 2] = lilyR;
      this.rippleInst[ri + 3] = ROTS[i];
      this.rippleInst[ri + 4] = LILY_NOTCH;
      this.rippleInst[ri + 5] = 1; // amp
      this.rippleInst[ri + 6] = 1; // foam = true (pinned static collar)
      this.rippleInst[ri + 7] = SEEDS[i];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rippleInst);
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.dragging = true;
      this.lastPx = p.x;
    } else if (p.type === "move" && p.down && this.dragging) {
      const dx = p.x - this.lastPx;
      this.lastPx = p.x;
      // Both halves track the same gap, so a drag of 1 unit widens the gap by
      // 2 (one pad moves out by 1, its sibling moves the other way by 1).
      const next = Math.min(
        Math.max(this.gap + dx * 2, this.gapMin),
        this.gapMax,
      );
      if (next !== this.gap) {
        this.gap = next;
        this.buildInstances();
      }
    } else if (p.type === "up") {
      this.dragging = false;
    }
  }

  frame(t: number, dt: number) {
    const gl = this.gl;
    const { w, h } = this;
    if (w === 0 || h === 0) return;
    if (this.theme.advance(dt)) this.lily.setTheme(this.theme.mix);
    const bg = lerpRgb(BG_DARK, BG_LIGHT, this.theme.mix);

    const vpSave = gl.getParameter(gl.VIEWPORT) as Int32Array;

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.fboW, this.fboH);

    // Mask pass: MAX blend so overlapping rings/foam never sum into a too-
    // bright band — they cap at the brighter contribution.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.maskProg);
    gl.uniform2f(this.uMaskRes, w, h);
    gl.uniform1f(this.uMaskScale, 1);
    gl.uniform1f(this.uMaskTime, t);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TOTAL_LILIES);

    // Displacement pass: additive blend on RG16F so signed offsets from
    // overlapping ripples sum (the physically correct stacking for refraction).
    if (this.floatBlend) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.dispFbo);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.dispProg);
      gl.uniform2f(this.uDispRes, w, h);
      gl.uniform1f(this.uDispScale, 1);
      gl.uniform1f(this.uDispTime, t);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, TOTAL_LILIES);
    }

    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD); // restore default for downstream draws
    gl.bindVertexArray(null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(vpSave[0], vpSave[1], vpSave[2], vpSave[3]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.vis.draw((vgl) => {
      vgl.activeTexture(vgl.TEXTURE0);
      vgl.bindTexture(vgl.TEXTURE_2D, this.maskTex);
      if (this.uVisMask) vgl.uniform1i(this.uVisMask, 0);
      vgl.activeTexture(vgl.TEXTURE1);
      vgl.bindTexture(vgl.TEXTURE_2D, this.dispTex);
      if (this.uVisDisp) vgl.uniform1i(this.uVisDisp, 1);
      if (this.uVisBg) vgl.uniform3f(this.uVisBg, bg[0], bg[1], bg[2]);
    });

    // Lily wires on top, normal alpha blending.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    this.lily.drawWires(this.lilyInst, TOTAL_LILIES, w, h, 0, P.wireGL);
    gl.disable(gl.BLEND);
  }

  dispose() {
    const gl = this.gl;
    this.lily.dispose();
    this.vis.dispose();
    gl.deleteProgram(this.maskProg);
    gl.deleteProgram(this.dispProg);
    gl.deleteFramebuffer(this.maskFbo);
    gl.deleteFramebuffer(this.dispFbo);
    gl.deleteTexture(this.maskTex);
    gl.deleteTexture(this.dispTex);
    gl.deleteTexture(this.noiseTex);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.instVbo);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new RippleTexturesSketch(host.gl, theme);
  },
};

export default mod;
