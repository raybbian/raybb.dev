import { RENDER_MSAA } from "@/render/frame";

// The mask is a normalized HEIGHT field: each caster renders its REAL geometry
// bottom-to-top with no blend, so where casters overlap the topmost wins. A
// receiver at height `recvH` is shadowed by anything taller; the gap
// (casterH - recvH) drives shadow displacement along the sun and its intensity.

// Sun upper-left; shadows fall down-right (screen px, y-down).
export const SHADOW_SUN_DIR: [number, number] = [0.75, 0.83];
// Logical px the shadow slides per unit height gap.
export const SHADOW_K = 138;
// final = mix(1, 1 - DARK, hit).
export const SHADOW_DARKNESS = 0.42;
// Min height a caster must exceed the receiver by to shadow it. This is the
// ONLY thing rejecting near-equal-height casters: too small and same-layer
// objects (e.g. fish at similar depth) shadow each other. Must stay well under
// the real gaps (lotus->pad ~0.083, distinct fish depths).
export const SHADOW_BIAS = 0.025;
// Darkness lost per unit caster-height gap (higher caster -> lighter shadow);
// 0 = flat intensity.
export const SHADOW_FADE = 1.2;

// Dorsal self-shadow: the fin is vertical, so its shadow is a band anchored at
// the spine and sheared down-sun by the fin's local height (NOT a slab the
// height mask could translate). Built on the CPU in Fish.buildGeometry(); kept
// small so it stays on the body (no clip). Fish.ts mirrors these + the sun dir.
export const DORSAL_SHADOW_SCALE = 0.9; // world-px shadow per world-px fin height
export const DORSAL_SHADOW_ALPHA = 0.42; // darkness; mirrors SHADOW_DARKNESS

// Scene heights, normalized CPU-side to [0,1] (0 = pond floor, 1 = tallest
// caster) so the mask never clamps and shaders need no encode/decode.
// FISH_TOP_H stays < WATER_H so submerged fish never shadow the surface.
export const LOTUS_H = 1.0;
export const LILYPAD_H = 1.1 / 1.2; // 0.9167
export const WATER_H = 1.05 / 1.2; // 0.875
const FISH_TOP_H = 1.0 / 1.2; // 0.8333, shallowest fish: just under the surface
const FISH_SPAN_H = 1.0 / 1.2; // span to floor -> wide fish<->fish gap

// Submergence (0..1, 0 = surface) -> scene height; submergence 1 lands on 0.
export function fishHeight(submergence: number): number {
  return FISH_TOP_H - submergence * FISH_SPAN_H;
}

// World-px shift applied to a caster in the cast pass so its silhouette lands
// where its shadow falls on the floor (height 0). Mirrors the receiver's
// SHADOW_SUN_DIR usage so net displacement stays K*(casterH - recvH).
export function castShadowOffset(castHeight: number): [number, number] {
  const m = SHADOW_K * castHeight;
  return [m * SHADOW_SUN_DIR[0], m * SHADOW_SUN_DIR[1]];
}

// Largest pre-projection any caster gets (tallest caster, height 1). Casters
// only shift bottom-right, so the mask is grown by exactly this on the far
// side (no symmetric margin); receivers remap their lookup into the grown mask.
export function maxCastOffset(): [number, number] {
  return castShadowOffset(1.0);
}

// Owns the RG8 premultiplied (height, coverage) mask. Between begin() and
// end() the lilypad/lotus/fish renderers rasterize their real geometry
// bottom-to-top with no blend (topmost caster wins per texel). end() resolves
// MSAA into the LINEAR texture: an edge texel becomes (cov*H, cov), so the
// receiver recovers true height as R/G while G carries anti-aliased coverage
// directly — no read-side fwidth/threshold AA, and the constant recovered
// height kills the dark rim that MAX-blend/single-R8 left.
export class ShadowRenderer {
  private gl: WebGL2RenderingContext;
  private msaaFbo: WebGLFramebuffer;
  private colorRb: WebGLRenderbuffer;
  private resolveFbo: WebGLFramebuffer;
  private shadowTex: WebGLTexture;
  private samples: number;
  private sw = 0;
  private sh = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.samples = Math.min(
      gl.getParameter(gl.MAX_SAMPLES) as number,
      RENDER_MSAA,
    );
    this.msaaFbo = gl.createFramebuffer()!;
    this.colorRb = gl.createRenderbuffer()!;
    this.resolveFbo = gl.createFramebuffer()!;
    this.shadowTex = gl.createTexture()!;
  }

  // `w`/`h` are drawing-buffer px; `dpr` converts the logical guard band to
  // drawing px. Grown by maxCastOffset() on the far side so a caster
  // pre-projected to the floor never clamps at the edge.
  resize(w: number, h: number, dpr: number) {
    const [ox, oy] = maxCastOffset();
    const sw = Math.max(1, w + Math.ceil(ox * dpr));
    const sh = Math.max(1, h + Math.ceil(oy * dpr));
    if (sw === this.sw && sh === this.sh) return;
    this.sw = sw;
    this.sh = sh;
    const gl = this.gl;

    // Multisampled RG8 caster target (keeps polygon AA). R = premultiplied
    // height (cov*H), G = coverage. RG8 is core-WebGL2 color-renderable +
    // multisample.
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRb);
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      this.samples,
      gl.RG8,
      sw,
      sh,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      this.colorRb,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("ShadowRenderer: MSAA framebuffer incomplete");
    }

    // Resolve target receivers sample. LINEAR + no mipmaps: R/G is exact under
    // linear filtering (premultiplied identity), so the edge carries clean
    // anti-aliased coverage in G.
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG8,
      sw,
      sh,
      0,
      gl.RG,
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
      this.shadowTex,
      0,
    );

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("ShadowRenderer: resolve framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get tex(): WebGLTexture {
    return this.shadowTex;
  }

  // Clears to coverage 0 (G=0 = "no caster" sentinel) and sets no-blend /
  // no-depth so casters drawn bottom-to-top simply overwrite (topmost wins).
  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); // G=0 -> nothing casts here
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Resolves MSAA into the sampleable LINEAR texture (polygon coverage -> the
  // ~1px smooth edge the receiver reads).
  end() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
    gl.blitFramebuffer(
      0,
      0,
      this.sw,
      this.sh,
      0,
      0,
      this.sw,
      this.sh,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST, // same dims -> NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteFramebuffer(this.msaaFbo);
    gl.deleteFramebuffer(this.resolveFbo);
    gl.deleteRenderbuffer(this.colorRb);
    gl.deleteTexture(this.shadowTex);
  }
}
