import { createProgram } from "@/lib/gl";
import { BG_DARK, BG_LIGHT, RENDER_MSAA } from "@/render/frame";
import { bindNoiseUniform } from "@/render/noiseTexture";
import {
  SHADOW_BIAS,
  SHADOW_DARKNESS,
  SHADOW_FADE,
  SHADOW_K,
  WATER_H,
  shadowMargin,
  shadowSunDir,
} from "@/render/ShadowRenderer";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "@/render/shaders/water.frag.glsl";
import RIPPLE_VS from "@/render/shaders/ripple.vert.glsl";
import RIPPLE_MASK_FS from "@/render/shaders/rippleMask.frag.glsl";
import RIPPLE_DISP_FS from "@/render/shaders/rippleDisp.frag.glsl";

export const MAX_RIPPLES = 96;
// 8 floats per instance: vec4 i_a (cx,cy,radius,rot) + vec4 i_b (notch,amp,foam,seed)
const RIPPLE_INST_FLOATS = 8;

// Surface features (lilypads, lotuses, treats, ...) feed the ripple stream by
// writing tuples straight into the renderer's instance buffer.
export interface RippleSink {
  addRipple(
    cx: number,
    cy: number,
    radius: number,
    rot: number,
    notch: number,
    amp: number,
    // false = travelling ring only (dynamic splashes/click rings). true =
    // also pin the static foam collar (steady pad/lotus rims).
    foam: boolean,
    // Stable per-source identity for the noise pattern. MUST NOT depend on the
    // emission slot/order (sources stream + reorder), or the foam/crest
    // pattern teleports as the array index shifts with scroll.
    seed: number,
  ): void;
}
// `u_deep` SHEEN target, per theme (lerped by themeMix). Dark: #1d5f5c.
// Light: origin/main's original deep teal (#1d5f5c).
export const DEEP_DARK: [number, number, number] = [0.06, 0.26, 0.25];
export const DEEP_LIGHT: [number, number, number] = [0.114, 0.373, 0.361];
// Toon-water mix factor (col = mix(scene, u_deep, SHEEN)) and the crest
// brightness boost (col += mask * RIPPLE_CREST). Pushed to the fragment
// shader as uniforms (u_sheen, u_rippleCrest) so the figure shaders can
// import the same TS-side constants without duplicating their values.
export const SHEEN = 0.06;
export const RIPPLE_CREST = 0.2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Unit quad covering [-1, 1]^2 as two triangles. Instanced once per ripple
// in the W4 bake passes; the vertex shader scales it to (radius + BAND) and
// translates to the ripple's center.
// prettier-ignore
const UNIT_QUAD = new Float32Array([
  -1, -1,   1, -1,   1, 1,
  -1, -1,   1,  1,  -1, 1,
]);

// Owns the offscreen scene capture and fullscreen water pass: scene -> MSAA
// FBO (keeps fish-silhouette AA) -> resolve -> ripple bake (mask + disp) ->
// water composite -> screen.
export class WaterRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  private msaaFboObj: WebGLFramebuffer;
  private colorRb: WebGLRenderbuffer;
  private resolveFbo: WebGLFramebuffer;
  private sceneTex: WebGLTexture;
  // Second scene attachment: per-pixel fish submergence (R8); 0 = open water.
  private depthRb: WebGLRenderbuffer;
  private depthResolveFbo: WebGLFramebuffer;
  private fishDepthTex: WebGLTexture;
  private samples: number;
  // Internal render size (drawing-buffer px * renderScale). The final water
  // pass renders here and is upscaled to the default framebuffer in present().
  private w = 0;
  private h = 0;
  // Single-sample target the composited water lands in before the upscale
  // blit; lets the heavy ripple ALU run at the scaled resolution.
  private outFbo: WebGLFramebuffer;
  private outTex: WebGLTexture;

  // W4: ripple bake pipeline. One quad per ripple, two passes (mask uses MAX
  // blend, disp uses additive). Mask texture is R8; disp texture is RG16F
  // because additive blending of signed displacement requires float storage.
  private rippleMaskProg: WebGLProgram;
  private rippleDispProg: WebGLProgram;
  private rippleMaskFbo: WebGLFramebuffer;
  private rippleDispFbo: WebGLFramebuffer;
  private rippleMaskTex: WebGLTexture;
  private rippleDispTex: WebGLTexture;
  private rippleVao: WebGLVertexArrayObject;
  private rippleQuadVbo: WebGLBuffer;
  private rippleInstVbo: WebGLBuffer;
  private uRippleMaskRes: WebGLUniformLocation;
  private uRippleMaskScale: WebGLUniformLocation;
  private uRippleMaskTime: WebGLUniformLocation;
  private uRippleDispRes: WebGLUniformLocation;
  private uRippleDispScale: WebGLUniformLocation;
  private uRippleDispTime: WebGLUniformLocation;

  // Packed instance data, 8 floats per ripple: i_a (cx, cy, radius, rot),
  // i_b (notch, amp, foam, seed). Replaces the five separate uniform-array
  // scratches the old per-pixel loop consumed.
  private rippleInst = new Float32Array(MAX_RIPPLES * RIPPLE_INST_FLOATS);
  private rippleCount = 0;

  private uScene: WebGLUniformLocation;
  private uRippleMaskSampler: WebGLUniformLocation;
  private uRippleDispSampler: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uDeep: WebGLUniformLocation;
  private uTheme: WebGLUniformLocation;
  // 0 = dark pond, 1 = light pond. Animated by the caller so a theme
  // toggle fades the water in lockstep with the CSS frost transition.
  private themeMix = 0;
  private uFishDepth: WebGLUniformLocation;
  private uShadow: WebGLUniformLocation;
  private uShadowDark: WebGLUniformLocation;
  private uSunDir: WebGLUniformLocation;
  private uShadowMargin: WebGLUniformLocation;
  private uShadowK: WebGLUniformLocation;
  private uShadowBias: WebGLUniformLocation;
  private uShadowFade: WebGLUniformLocation;
  private uRecvHeight: WebGLUniformLocation;
  private uScale: WebGLUniformLocation;
  private uSheen: WebGLUniformLocation;
  private uRippleCrest: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.samples = Math.min(
      gl.getParameter(gl.MAX_SAMPLES) as number,
      RENDER_MSAA,
    );

    // Float-blendable render targets: required for additive blending into the
    // signed-displacement bake texture (RG16F). All WebGL2 implementations we
    // target ship this; log once if it's missing so failures stay diagnosable.
    if (!gl.getExtension("EXT_color_buffer_float")) {
      console.error(
        "WaterRenderer: EXT_color_buffer_float missing; ripple displacement bake will be incorrect",
      );
    }

    const u = (n: string) => gl.getUniformLocation(this.prog, n)!;
    this.uScene = u("u_scene");
    this.uRippleMaskSampler = u("u_rippleMask");
    this.uRippleDispSampler = u("u_rippleDisp");
    this.uRes = u("u_res");
    this.uTime = u("u_time");
    this.uDeep = u("u_deep");
    this.uTheme = u("u_theme");
    this.uFishDepth = u("u_fishDepth");
    this.uShadow = u("u_shadow");
    this.uShadowDark = u("u_shadowDark");
    this.uSunDir = u("u_sunDir");
    this.uShadowMargin = u("u_shadowMargin");
    this.uShadowK = u("u_shadowK");
    this.uShadowBias = u("u_shadowBias");
    this.uShadowFade = u("u_shadowFade");
    this.uRecvHeight = u("u_recvHeight");
    this.uScale = u("u_scale");
    this.uSheen = u("u_sheen");
    this.uRippleCrest = u("u_rippleCrest");
    // The shared noise texture (ambient refraction + foam/crest width
    // variation + shadow.glsl wavy displacement) is bound once on a
    // reserved unit; u_noise points at it for the life of the program.
    bindNoiseUniform(gl, this.prog);

    this.rippleMaskProg = createProgram(gl, RIPPLE_VS, RIPPLE_MASK_FS);
    this.rippleDispProg = createProgram(gl, RIPPLE_VS, RIPPLE_DISP_FS);
    this.uRippleMaskRes = gl.getUniformLocation(this.rippleMaskProg, "u_res")!;
    this.uRippleMaskScale = gl.getUniformLocation(this.rippleMaskProg, "u_scale")!;
    this.uRippleMaskTime = gl.getUniformLocation(this.rippleMaskProg, "u_time")!;
    this.uRippleDispRes = gl.getUniformLocation(this.rippleDispProg, "u_res")!;
    this.uRippleDispScale = gl.getUniformLocation(this.rippleDispProg, "u_scale")!;
    this.uRippleDispTime = gl.getUniformLocation(this.rippleDispProg, "u_time")!;
    bindNoiseUniform(gl, this.rippleMaskProg);

    this.vao = gl.createVertexArray()!; // empty: vertices from gl_VertexID
    this.msaaFboObj = gl.createFramebuffer()!;
    this.colorRb = gl.createRenderbuffer()!;
    this.resolveFbo = gl.createFramebuffer()!;
    this.sceneTex = gl.createTexture()!;
    this.depthRb = gl.createRenderbuffer()!;
    this.depthResolveFbo = gl.createFramebuffer()!;
    this.fishDepthTex = gl.createTexture()!;
    this.outFbo = gl.createFramebuffer()!;
    this.outTex = gl.createTexture()!;
    this.rippleMaskFbo = gl.createFramebuffer()!;
    this.rippleDispFbo = gl.createFramebuffer()!;
    this.rippleMaskTex = gl.createTexture()!;
    this.rippleDispTex = gl.createTexture()!;

    this.rippleQuadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rippleQuadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW);
    this.rippleInstVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rippleInstVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      MAX_RIPPLES * RIPPLE_INST_FLOATS * 4,
      gl.DYNAMIC_DRAW,
    );
    // Both bake programs use the same attribute layout (a_unit, i_a, i_b);
    // one VAO works for either, since the vertex shader source is identical.
    this.rippleVao = this.buildRippleVao(this.rippleMaskProg);
  }

  private buildRippleVao(prog: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rippleQuadVbo);
    const aUnit = gl.getAttribLocation(prog, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rippleInstVbo);
    const stride = RIPPLE_INST_FLOATS * 4;
    const iA = gl.getAttribLocation(prog, "i_a");
    gl.enableVertexAttribArray(iA);
    gl.vertexAttribPointer(iA, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(iA, 1);
    const iB = gl.getAttribLocation(prog, "i_b");
    gl.enableVertexAttribArray(iB);
    gl.vertexAttribPointer(iB, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(iB, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  // mix in [0,1]: 0 = dark pond, 1 = light pond. Set once per frame before
  // beginScene()/composite() so the clear colour and shader tints agree.
  setTheme(mix: number): void {
    this.themeMix = mix;
  }

  beginRipples(): void {
    this.rippleCount = 0;
  }

  // cx,cy,radius,rot,notch,amp in logical px / rad. Sources past MAX_RIPPLES
  // are dropped (first MAX_RIPPLES kept in emission order).
  addRipple(
    cx: number,
    cy: number,
    radius: number,
    rot: number,
    notch: number,
    amp: number,
    foam: boolean,
    seed: number,
  ): void {
    const i = this.rippleCount;
    if (i >= MAX_RIPPLES) return;
    const o = i * RIPPLE_INST_FLOATS;
    this.rippleInst[o + 0] = cx;
    this.rippleInst[o + 1] = cy;
    this.rippleInst[o + 2] = radius;
    this.rippleInst[o + 3] = rot;
    this.rippleInst[o + 4] = notch;
    this.rippleInst[o + 5] = amp;
    this.rippleInst[o + 6] = foam ? 1 : 0;
    this.rippleInst[o + 7] = seed;
    this.rippleCount = i + 1;
  }

  // Clears both MRT attachments separately (color -> background water,
  // submergence -> 0); a single clear won't cover the second attachment.
  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFboObj);
    gl.viewport(0, 0, this.w, this.h);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const t = this.themeMix;
    gl.clearBufferfv(gl.COLOR, 0, [
      lerp(BG_DARK[0], BG_LIGHT[0], t),
      lerp(BG_DARK[1], BG_LIGHT[1], t),
      lerp(BG_DARK[2], BG_LIGHT[2], t),
      1,
    ]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]); // R=0 -> no fish
    gl.disable(gl.DEPTH_TEST);
  }

  get msaaFbo(): WebGLFramebuffer {
    return this.msaaFboObj;
  }

  // (Re)allocates the offscreen attachments. `w`/`h` are drawing-buffer px.
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRb);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      this.samples,
      gl.RGBA8,
      w,
      h,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFboObj);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      this.colorRb,
    );

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      this.samples,
      gl.R8,
      w,
      h,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.RENDERBUFFER,
      this.depthRb,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneTex,
      0,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.fishDepthTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      w,
      h,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthResolveFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.fishDepthTex,
      0,
    );

    // Composite output at the internal (scaled) size; LINEAR so present()'s
    // upscale blit to the full-res default framebuffer reads smoothly.
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outTex,
      0,
    );

    // W4 ripple mask: single-channel, MAX-blended across overlapping ripples.
    gl.bindTexture(gl.TEXTURE_2D, this.rippleMaskTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      w,
      h,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rippleMaskFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.rippleMaskTex,
      0,
    );

    // W4 ripple displacement: RG16F so signed values blend additively. The
    // refractive offset summed here is small (a few px per ripple, ~tens of
    // px even at heavy overlap), well within 16-bit float range.
    gl.bindTexture(gl.TEXTURE_2D, this.rippleDispTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG16F,
      w,
      h,
      0,
      gl.RG,
      gl.HALF_FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rippleDispFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.rippleDispTex,
      0,
    );

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("WaterRenderer: framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Bakes the ripple foam/crest mask (MAX) and additive displacement (ADD)
  // into the two ripple textures. One instanced draw per pass covers every
  // active ripple as a quad sized to (radius + RIPPLE_BAND).
  private bakeRipples(width: number, height: number, time: number, worldScale: number) {
    const gl = this.gl;
    if (this.rippleCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rippleInstVbo);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        this.rippleInst,
        0,
        this.rippleCount * RIPPLE_INST_FLOATS,
      );
    }

    gl.bindVertexArray(this.rippleVao);
    gl.viewport(0, 0, this.w, this.h);

    // Mask pass: MAX blend so an overlapping foam collar + travelling ring
    // never sum into a brighter band (matches the old loop's `mask = max(...)`).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rippleMaskFbo);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    if (this.rippleCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.rippleMaskProg);
      gl.uniform2f(this.uRippleMaskRes, width, height);
      gl.uniform1f(this.uRippleMaskScale, worldScale);
      gl.uniform1f(this.uRippleMaskTime, time);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.rippleCount);
    }

    // Displacement pass: additive blend on RG16F so signed contributions
    // from overlapping ripples sum (matches `offsetPx += ...`).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rippleDispFbo);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    if (this.rippleCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.rippleDispProg);
      gl.uniform2f(this.uRippleDispRes, width, height);
      gl.uniform1f(this.uRippleDispScale, worldScale);
      gl.uniform1f(this.uRippleDispTime, time);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.rippleCount);
    }

    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD); // restore default
    gl.bindVertexArray(null);
  }

  // Ripple sources must already have been fed via beginRipples()/addRipple()
  // this frame. `width`/`height` are logical px.
  composite(
    width: number,
    height: number,
    time: number,
    shadowTex: WebGLTexture,
    worldScale: number,
  ) {
    const gl = this.gl;

    // MRT must be resolved one attachment at a time via readBuffer/draw-FBO
    // pairing (same dims -> NEAREST).
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFboObj);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
    gl.blitFramebuffer(
      0,
      0,
      this.w,
      this.h,
      0,
      0,
      this.w,
      this.h,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depthResolveFbo);
    gl.blitFramebuffer(
      0,
      0,
      this.w,
      this.h,
      0,
      0,
      this.w,
      this.h,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // restore default

    // W4: bake ripple mask + disp before the composite reads them.
    this.bakeRipples(width, height, time, worldScale);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    // Composite into the scaled output target (not the screen): the ripple
    // ALU then costs ~renderScale^2 of full-res. present() upscales it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rippleMaskTex);
    gl.uniform1i(this.uRippleMaskSampler, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fishDepthTex);
    gl.uniform1i(this.uFishDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(this.uShadow, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.rippleDispTex);
    gl.uniform1i(this.uRippleDispSampler, 4);
    gl.uniform1f(this.uShadowDark, SHADOW_DARKNESS);
    const sd = shadowSunDir(this.themeMix);
    gl.uniform2f(this.uSunDir, sd[0], sd[1]);
    const [mx, my] = shadowMargin();
    gl.uniform2f(this.uShadowMargin, mx, my);
    gl.uniform1f(this.uShadowK, SHADOW_K);
    gl.uniform1f(this.uShadowBias, SHADOW_BIAS);
    gl.uniform1f(this.uShadowFade, SHADOW_FADE);
    gl.uniform1f(this.uRecvHeight, WATER_H);
    gl.uniform2f(this.uRes, width, height);
    gl.uniform1f(this.uTime, time);
    gl.uniform1f(this.uScale, worldScale);
    gl.uniform1f(this.uSheen, SHEEN);
    gl.uniform1f(this.uRippleCrest, RIPPLE_CREST);
    const t = this.themeMix;
    gl.uniform1f(this.uTheme, t);
    gl.uniform3f(
      this.uDeep,
      lerp(DEEP_DARK[0], DEEP_LIGHT[0], t),
      lerp(DEEP_DARK[1], DEEP_LIGHT[1], t),
      lerp(DEEP_DARK[2], DEEP_LIGHT[2], t),
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0); // leave default unit active for others
  }

  // Upscales the scaled composite to the full-res default framebuffer and
  // leaves it bound at the full viewport so the crisp top layer (lilypads,
  // lotuses) draws over it at native resolution. `fullW`/`fullH` are
  // drawing-buffer px.
  present(fullW: number, fullH: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.outFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0,
      0,
      this.w,
      this.h,
      0,
      0,
      fullW,
      fullH,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, fullW, fullH);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.rippleMaskProg);
    gl.deleteProgram(this.rippleDispProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.rippleVao);
    gl.deleteBuffer(this.rippleQuadVbo);
    gl.deleteBuffer(this.rippleInstVbo);
    gl.deleteFramebuffer(this.msaaFboObj);
    gl.deleteFramebuffer(this.resolveFbo);
    gl.deleteFramebuffer(this.depthResolveFbo);
    gl.deleteFramebuffer(this.rippleMaskFbo);
    gl.deleteFramebuffer(this.rippleDispFbo);
    gl.deleteRenderbuffer(this.colorRb);
    gl.deleteRenderbuffer(this.depthRb);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.fishDepthTex);
    gl.deleteTexture(this.rippleMaskTex);
    gl.deleteTexture(this.rippleDispTex);
    gl.deleteFramebuffer(this.outFbo);
    gl.deleteTexture(this.outTex);
  }
}

