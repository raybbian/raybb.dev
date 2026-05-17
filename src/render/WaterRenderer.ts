import { createProgram } from "@/lib/gl";
import { BG } from "@/render/frame";
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

// Upper bound for the shader's ripple-source uniform array. Kept here so the
// GLSL `#define` and the JS-side scratch buffer stay in lockstep. Any surface
// feature (lilypads, lotuses, ...) feeds this same ripple stream.
export const MAX_RIPPLES = 48;
const MAX_MSAA = 4; // cap MSAA samples (matches the prior context default)

// Any surface feature (lilypads, lotuses, treats, ...) feeds the water pass's
// ripple stream by writing tuples straight into the renderer's uniform
// scratch — no intermediate array, no second copy in composite().
export interface RippleSink {
  addRipple(
    cx: number,
    cy: number,
    radius: number,
    rot: number,
    notch: number,
    amp: number,
  ): void;
}
const REFRACT_SHIFT = 2; // ambient refraction baked at 1/4 res (low-freq)
const DEEP: [number, number, number] = [0.114, 0.373, 0.361]; // #1d5f5c

// Inject the array-size define after the `#version` line (GLSL requires
// `#version` to stay first).
const def = `#define MAX_RIPPLES ${MAX_RIPPLES}\n`;
const FS_SRC = FS.replace(/(#version[^\n]*\n)/, `$1${def}`);

// Owns the offscreen scene capture and the fullscreen water pass. The scene
// is drawn into a multisampled FBO (so the fish silhouette keeps its AA),
// resolved into a sampleable texture, then refracted/rippled onto screen.
export class WaterRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  private msaaFboObj: WebGLFramebuffer;
  private colorRb: WebGLRenderbuffer;
  private resolveFbo: WebGLFramebuffer;
  private sceneTex: WebGLTexture;
  // Second scene attachment: per-pixel fish submergence (R8). 0 = open water.
  private depthRb: WebGLRenderbuffer;
  private depthResolveFbo: WebGLFramebuffer;
  private fishDepthTex: WebGLTexture;
  private samples: number;
  private w = 0;
  private h = 0;

  // Low-res ambient-refraction pass.
  private refractProg: WebGLProgram;
  private refractFbo: WebGLFramebuffer;
  private refractTex: WebGLTexture;
  private rw = 0;
  private rh = 0;
  private uRefractRes: WebGLUniformLocation;
  private uRefractTime: WebGLUniformLocation;

  // Uploaded as vec4 (cx,cy,radius,rot) plus parallel notch-half + amp arrays.
  // Filled directly by addRipple() each frame (no intermediate array).
  private rippleScratch = new Float32Array(MAX_RIPPLES * 4);
  private notchScratch = new Float32Array(MAX_RIPPLES);
  private ampScratch = new Float32Array(MAX_RIPPLES);
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
  private uFishDepth: WebGLUniformLocation;
  private uShadow: WebGLUniformLocation;
  private uShadowDark: WebGLUniformLocation;
  private uSunDir: WebGLUniformLocation;
  private uShadowK: WebGLUniformLocation;
  private uShadowBias: WebGLUniformLocation;
  private uShadowFade: WebGLUniformLocation;
  private uRecvHeight: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS_SRC);
    this.samples = Math.min(gl.getParameter(gl.MAX_SAMPLES) as number, MAX_MSAA);

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
    this.uFishDepth = u("u_fishDepth");
    this.uShadow = u("u_shadow");
    this.uShadowDark = u("u_shadowDark");
    this.uSunDir = u("u_sunDir");
    this.uShadowK = u("u_shadowK");
    this.uShadowBias = u("u_shadowBias");
    this.uShadowFade = u("u_shadowFade");
    this.uRecvHeight = u("u_recvHeight");

    this.refractProg = createProgram(gl, VS, REFRACT_FS);
    this.uRefractRes = gl.getUniformLocation(this.refractProg, "u_res")!;
    this.uRefractTime = gl.getUniformLocation(this.refractProg, "u_time")!;

    this.vao = gl.createVertexArray()!; // empty: vertices come from gl_VertexID
    this.msaaFboObj = gl.createFramebuffer()!;
    this.colorRb = gl.createRenderbuffer()!;
    this.resolveFbo = gl.createFramebuffer()!;
    this.sceneTex = gl.createTexture()!;
    this.refractFbo = gl.createFramebuffer()!;
    this.refractTex = gl.createTexture()!;
    this.depthRb = gl.createRenderbuffer()!;
    this.depthResolveFbo = gl.createFramebuffer()!;
    this.fishDepthTex = gl.createTexture()!;
  }

  // Reset the ripple stream for a new frame. Sources then call addRipple()
  // directly; composite() uploads the scratch as-is (no copy).
  beginRipples(): void {
    this.rippleCount = 0;
  }

  // cx,cy,radius,rot,notch,amp in logical px / rad. Past MAX_RIPPLES the
  // extra sources are dropped (matches the old length-cap behaviour, which
  // kept the first MAX_RIPPLES in emission order).
  addRipple(
    cx: number,
    cy: number,
    radius: number,
    rot: number,
    notch: number,
    amp: number,
  ): void {
    const i = this.rippleCount;
    if (i >= MAX_RIPPLES) return;
    this.rippleScratch[i * 4 + 0] = cx;
    this.rippleScratch[i * 4 + 1] = cy;
    this.rippleScratch[i * 4 + 2] = radius;
    this.rippleScratch[i * 4 + 3] = rot;
    this.notchScratch[i] = notch;
    this.ampScratch[i] = amp;
    this.rippleCount = i + 1;
  }

  // Binds the offscreen scene FBO and clears both attachments for a new
  // frame: color -> background water, depth -> 0 ("no fish"). The second
  // attachment needs its own clear, so this is not a plain single clear.
  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFboObj);
    gl.viewport(0, 0, this.w, this.h);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearBufferfv(gl.COLOR, 0, BG);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]); // R=0 -> open water
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

    // Second attachment: single-channel fish submergence, same MSAA count.
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

    // Resolve target for the fish-depth attachment (single-sample R8).
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

    // Low-res ambient-refraction target (low-frequency -> quarter res).
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

    if (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
    ) {
      console.error("WaterRenderer: framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Resolves the captured scene and draws the water onto the default
  // framebuffer. Ripple sources must already have been fed via
  // beginRipples()/addRipple() this frame. `width`/`height` are logical px
  // (for u_res).
  composite(
    width: number,
    height: number,
    time: number,
    shadowTex: WebGLTexture,
  ) {
    const gl = this.gl;

    // Resolve MSAA -> single-sample textures (same dims, NEAREST). MRT must
    // be resolved one attachment at a time via readBuffer/draw FBO pairing.
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
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // restore default read buffer

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    // Bake the low-res ambient refraction. u_res stays logical so the noise
    // field is resolution-independent; the viewport sets sampling density.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.refractFbo);
    gl.viewport(0, 0, this.rw, this.rh);
    gl.useProgram(this.refractProg);
    gl.uniform2f(this.uRefractRes, width, height);
    gl.uniform1f(this.uRefractTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    gl.uniform3fv(this.uDeep, DEEP);

    // Scratch is already populated for this frame by addRipple(); upload
    // it directly (no per-frame copy / re-pack).
    gl.uniform1i(this.uRippleCount, this.rippleCount);
    gl.uniform4fv(this.uRipples, this.rippleScratch);
    gl.uniform1fv(this.uRippleNotch, this.notchScratch);
    gl.uniform1fv(this.uRippleAmp, this.ampScratch);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0); // leave the default unit active for others
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
  }
}
