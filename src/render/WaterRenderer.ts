import { createProgram } from "@/lib/gl";
import { BG, RENDER_MSAA } from "@/render/frame";
import {
  SHADOW_BIAS,
  SHADOW_DARKNESS,
  SHADOW_FADE,
  SHADOW_K,
  SHADOW_SUN_DIR,
  WATER_H,
} from "@/render/ShadowRenderer";
import VS from "@/shaders/water.vert.glsl";
import FS from "@/shaders/water.frag.glsl";
import REFRACT_FS from "@/shaders/refract.frag.glsl";

// Upper bound for the shader's ripple-source uniform array (the GLSL `#define`
// below is injected from this, so it's the single source of truth). Per-frame
// cost is bounded by the actual u_rippleCount, not this cap, so emission is
// clipped to the visible band (FishBackground / Lotuses.emitRipples) to keep
// it low. Headroom budget: on-screen pads + lotuses (viewport-proportional at
// the streamed density) + <=24 click rings + <=12 treat splashes.
export const MAX_RIPPLES = 96;

// Surface features (lilypads, lotuses, treats, ...) feed the ripple stream by
// writing tuples straight into the renderer's uniform scratch.
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
const REFRACT_SHIFT = 2; // ambient refraction baked at 1/4 res (low-freq)
const DEEP: [number, number, number] = [0.114, 0.373, 0.361]; // #1d5f5c

// Define must follow the `#version` line (GLSL requires `#version` first).
const def = `#define MAX_RIPPLES ${MAX_RIPPLES}\n`;
const FS_SRC = FS.replace(/(#version[^\n]*\n)/, `$1${def}`);

// Owns the offscreen scene capture and fullscreen water pass: scene -> MSAA
// FBO (keeps fish-silhouette AA) -> resolve -> refract/ripple onto screen.
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

  private refractProg: WebGLProgram;
  private refractFbo: WebGLFramebuffer;
  private refractTex: WebGLTexture;
  private rw = 0;
  private rh = 0;
  private uRefractRes: WebGLUniformLocation;
  private uRefractTime: WebGLUniformLocation;

  // Uploaded as vec4 (cx,cy,radius,rot) plus parallel notch + amp arrays.
  private rippleScratch = new Float32Array(MAX_RIPPLES * 4);
  private notchScratch = new Float32Array(MAX_RIPPLES);
  private ampScratch = new Float32Array(MAX_RIPPLES);
  private foamScratch = new Float32Array(MAX_RIPPLES); // 1 = collar, 0 = off
  private seedScratch = new Float32Array(MAX_RIPPLES); // stable per-source id
  private rippleCount = 0;

  private uScene: WebGLUniformLocation;
  private uRefract: WebGLUniformLocation;
  private uRes: WebGLUniformLocation;
  private uTime: WebGLUniformLocation;
  private uDeep: WebGLUniformLocation;
  private uRippleCount: WebGLUniformLocation;
  private uRipples: WebGLUniformLocation;
  private uRippleNotch: WebGLUniformLocation;
  private uRippleAmp: WebGLUniformLocation;
  private uRippleFoam: WebGLUniformLocation;
  private uRippleSeed: WebGLUniformLocation;
  private uFishDepth: WebGLUniformLocation;
  private uShadow: WebGLUniformLocation;
  private uShadowDark: WebGLUniformLocation;
  private uSunDir: WebGLUniformLocation;
  private uShadowK: WebGLUniformLocation;
  private uShadowBias: WebGLUniformLocation;
  private uShadowFade: WebGLUniformLocation;
  private uRecvHeight: WebGLUniformLocation;
  private uScale: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS_SRC);
    this.samples = Math.min(
      gl.getParameter(gl.MAX_SAMPLES) as number,
      RENDER_MSAA,
    );

    const u = (n: string) => gl.getUniformLocation(this.prog, n)!;
    this.uScene = u("u_scene");
    this.uRefract = u("u_refract");
    this.uRes = u("u_res");
    this.uTime = u("u_time");
    this.uDeep = u("u_deep");
    this.uRippleCount = u("u_rippleCount");
    this.uRipples = u("u_ripples");
    this.uRippleNotch = u("u_rippleNotch");
    this.uRippleAmp = u("u_rippleAmp");
    this.uRippleFoam = u("u_rippleFoam");
    this.uRippleSeed = u("u_rippleSeed");
    this.uFishDepth = u("u_fishDepth");
    this.uShadow = u("u_shadow");
    this.uShadowDark = u("u_shadowDark");
    this.uSunDir = u("u_sunDir");
    this.uShadowK = u("u_shadowK");
    this.uShadowBias = u("u_shadowBias");
    this.uShadowFade = u("u_shadowFade");
    this.uRecvHeight = u("u_recvHeight");
    this.uScale = u("u_scale");

    this.refractProg = createProgram(gl, VS, REFRACT_FS);
    this.uRefractRes = gl.getUniformLocation(this.refractProg, "u_res")!;
    this.uRefractTime = gl.getUniformLocation(this.refractProg, "u_time")!;

    this.vao = gl.createVertexArray()!; // empty: vertices from gl_VertexID
    this.msaaFboObj = gl.createFramebuffer()!;
    this.colorRb = gl.createRenderbuffer()!;
    this.resolveFbo = gl.createFramebuffer()!;
    this.sceneTex = gl.createTexture()!;
    this.refractFbo = gl.createFramebuffer()!;
    this.refractTex = gl.createTexture()!;
    this.depthRb = gl.createRenderbuffer()!;
    this.depthResolveFbo = gl.createFramebuffer()!;
    this.fishDepthTex = gl.createTexture()!;
    this.outFbo = gl.createFramebuffer()!;
    this.outTex = gl.createTexture()!;
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
    this.rippleScratch[i * 4 + 0] = cx;
    this.rippleScratch[i * 4 + 1] = cy;
    this.rippleScratch[i * 4 + 2] = radius;
    this.rippleScratch[i * 4 + 3] = rot;
    this.notchScratch[i] = notch;
    this.ampScratch[i] = amp;
    this.foamScratch[i] = foam ? 1 : 0;
    this.seedScratch[i] = seed;
    this.rippleCount = i + 1;
  }

  // Clears both MRT attachments separately (color -> background water,
  // submergence -> 0); a single clear won't cover the second attachment.
  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFboObj);
    gl.viewport(0, 0, this.w, this.h);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearBufferfv(gl.COLOR, 0, BG);
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
      gl.RENDERBUFFER, this.samples, gl.RGBA8, w, h,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFboObj);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.colorRb,
    );

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER, this.samples, gl.R8, w, h,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, this.depthRb,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.fishDepthTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthResolveFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fishDepthTex, 0,
    );

    // Low-frequency -> quarter-res refraction target.
    this.rw = Math.max(1, w >> REFRACT_SHIFT);
    this.rh = Math.max(1, h >> REFRACT_SHIFT);
    gl.bindTexture(gl.TEXTURE_2D, this.refractTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, this.rw, this.rh, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.refractFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.refractTex, 0,
    );

    // Composite output at the internal (scaled) size; LINEAR so present()'s
    // upscale blit to the full-res default framebuffer reads smoothly.
    gl.bindTexture(gl.TEXTURE_2D, this.outTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outTex, 0,
    );

    if (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
    ) {
      console.error("WaterRenderer: framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Ripple sources must already have been fed via beginRipples()/addRipple()
  // this frame. `width`/`height` are logical px.
  composite(
    width: number,
    height: number,
    time: number,
    shadowTex: WebGLTexture,
    screenScale: number,
  ) {
    const gl = this.gl;

    // MRT must be resolved one attachment at a time via readBuffer/draw-FBO
    // pairing (same dims -> NEAREST).
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFboObj);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
    gl.blitFramebuffer(
      0, 0, this.w, this.h, 0, 0, this.w, this.h,
      gl.COLOR_BUFFER_BIT, gl.NEAREST,
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.depthResolveFbo);
    gl.blitFramebuffer(
      0, 0, this.w, this.h, 0, 0, this.w, this.h,
      gl.COLOR_BUFFER_BIT, gl.NEAREST,
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // restore default

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    // u_res stays logical so the noise field is resolution-independent; the
    // viewport sets sampling density.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.refractFbo);
    gl.viewport(0, 0, this.rw, this.rh);
    gl.useProgram(this.refractProg);
    gl.uniform2f(this.uRefractRes, width, height);
    gl.uniform1f(this.uRefractTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Composite into the scaled output target (not the screen): the ripple
    // ALU then costs ~renderScale^2 of full-res. present() upscales it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.refractTex);
    gl.uniform1i(this.uRefract, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.fishDepthTex);
    gl.uniform1i(this.uFishDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(this.uShadow, 3);
    gl.uniform1f(this.uShadowDark, SHADOW_DARKNESS);
    gl.uniform2f(this.uSunDir, SHADOW_SUN_DIR[0], SHADOW_SUN_DIR[1]);
    gl.uniform1f(this.uShadowK, SHADOW_K);
    gl.uniform1f(this.uShadowBias, SHADOW_BIAS);
    gl.uniform1f(this.uShadowFade, SHADOW_FADE);
    gl.uniform1f(this.uRecvHeight, WATER_H);
    gl.uniform2f(this.uRes, width, height);
    gl.uniform1f(this.uTime, time);
    gl.uniform1f(this.uScale, screenScale);
    gl.uniform3fv(this.uDeep, DEEP);

    gl.uniform1i(this.uRippleCount, this.rippleCount);
    gl.uniform4fv(this.uRipples, this.rippleScratch);
    gl.uniform1fv(this.uRippleNotch, this.notchScratch);
    gl.uniform1fv(this.uRippleAmp, this.ampScratch);
    gl.uniform1fv(this.uRippleFoam, this.foamScratch);
    gl.uniform1fv(this.uRippleSeed, this.seedScratch);

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
      0, 0, this.w, this.h, 0, 0, fullW, fullH,
      gl.COLOR_BUFFER_BIT, gl.LINEAR,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, fullW, fullH);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.refractProg);
    gl.deleteVertexArray(this.vao);
    gl.deleteFramebuffer(this.msaaFboObj);
    gl.deleteFramebuffer(this.resolveFbo);
    gl.deleteFramebuffer(this.refractFbo);
    gl.deleteFramebuffer(this.depthResolveFbo);
    gl.deleteRenderbuffer(this.colorRb);
    gl.deleteRenderbuffer(this.depthRb);
    gl.deleteTexture(this.sceneTex);
    gl.deleteTexture(this.refractTex);
    gl.deleteTexture(this.fishDepthTex);
    gl.deleteFramebuffer(this.outFbo);
    gl.deleteTexture(this.outTex);
  }
}
