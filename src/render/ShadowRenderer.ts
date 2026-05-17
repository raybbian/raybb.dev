// --- Shadow model (shared with every caster/receiver of the height mask) ----
// The mask is a normalized HEIGHT field: each caster renders its REAL
// geometry with a height-output fragment shader, bottom-to-top with no blend,
// so where casters overlap the last (topmost) one wins (its shadow encloses
// anything beneath). A receiver at height `recvH` is shadowed by anything taller; the
// gap (casterH - recvH) drives how far the shadow is displaced along the sun
// direction and its intensity.
//
// Sun sits upper-left; shadows fall down-right (screen px, y-down).
export const SHADOW_SUN_DIR: [number, number] = [0.75, 0.83];
// Logical px the shadow slides per unit height gap.
export const SHADOW_K = 138;
// How dark a shadowed pixel gets: final = mix(1, 1 - DARK, hit).
export const SHADOW_DARKNESS = 0.42;
// Min height a caster must exceed the receiver by before it shadows it. This
// is the ONLY thing rejecting near-equal-height casters, so too small and
// objects in the same layer (e.g. fish at similar depth) shadow each other and
// shadows appear to stack on shadows. Must stay well under the real gaps
// (lotus->pad ~0.083, distinct fish depths).
export const SHADOW_BIAS = 0.025;
// Darkness lost per unit caster-height gap: the higher (further away) the
// caster sits above the receiver, the lighter its shadow. 0 = flat intensity.
export const SHADOW_FADE = 1.2;

// Scene heights, normalized CPU-side to [0,1]: 0 = pond floor (deepest fish),
// 1 = the tallest caster (lotus). Storing them directly in this range means
// the mask never clamps and the shaders need no encode/decode. Lotus floats
// above the pads, pads on the surface, open water a notch below, fish just
// under it; FISH_TOP_H stays < WATER_H so submerged fish never shadow surface.
export const LOTUS_H = 1.0;
export const LILYPAD_H = 1.1 / 1.2; // 0.9167
export const WATER_H = 1.05 / 1.2; // 0.875
const FISH_TOP_H = 1.0 / 1.2; // 0.8333, shallowest fish: just under the surface
const FISH_SPAN_H = 1.0 / 1.2; // span to the floor -> wide fish<->fish gap

// Submergence (0..1, 0 = surface) -> scene height. Shallow fish ride high and
// cast onto the deeper fish below them; submergence 1 lands exactly on 0.
export function fishHeight(submergence: number): number {
  return FISH_TOP_H - submergence * FISH_SPAN_H;
}

// World-px offset a caster's geometry is shifted by in the cast pass so its
// silhouette lands where its shadow would fall on the floor (height 0). Mirrors
// the receiver's (non-normalized) SHADOW_SUN_DIR usage so the net displacement
// stays K*(casterH - recvH).
export function castShadowOffset(castHeight: number): [number, number] {
  const m = SHADOW_K * castHeight;
  return [m * SHADOW_SUN_DIR[0], m * SHADOW_SUN_DIR[1]];
}

// The largest pre-projection any caster gets (the tallest caster, height 1).
// Casters only ever shift toward the bottom-right, so the mask is grown by
// exactly this on the far side (no symmetric margin); the screen stays at its
// origin and receivers remap their lookup into the grown mask.
export function maxCastOffset(): [number, number] {
  return castShadowOffset(1.0);
}

const MAX_MSAA = 4; // cap MSAA samples (matches WaterRenderer)

// Owns the full-res RG8 premultiplied (height, coverage) mask. It does not
// draw anything itself: between begin() and end() the lilypad/lotus/fish
// renderers rasterize their own real geometry into a multisampled buffer in
// bottom-to-top order (deepest caster first, tallest last). No blend — each
// caster overwrites — so the topmost caster covering a texel wins and its MSAA
// silhouette is composited cleanly over whatever is beneath. end() resolves
// into the LINEAR texture: an edge texel becomes (cov*H, cov), so the receiver
// recovers the true (un-diluted) height as R/G while G carries the smooth,
// anti-aliased coverage directly — no read-side fwidth/threshold AA, and the
// constant recovered height kills the dark rim MAX-blend/single-R8 left.
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
      MAX_MSAA,
    );
    this.msaaFbo = gl.createFramebuffer()!;
    this.colorRb = gl.createRenderbuffer()!;
    this.resolveFbo = gl.createFramebuffer()!;
    this.shadowTex = gl.createTexture()!;
  }

  // (Re)allocates the RG8 mask. `w`/`h` are drawing-buffer px (same args as
  // WaterRenderer.resize); `dpr` converts the logical guard band to drawing
  // px. The mask is grown by maxCastOffset() on the far side so a caster
  // pre-projected to the floor never clamps at the edge.
  resize(w: number, h: number, dpr: number) {
    const [ox, oy] = maxCastOffset();
    const sw = Math.max(1, w + Math.ceil(ox * dpr));
    const sh = Math.max(1, h + Math.ceil(oy * dpr));
    if (sw === this.sw && sh === this.sh) return;
    this.sw = sw;
    this.sh = sh;
    const gl = this.gl;

    // Multisampled RG8 caster target: casters rasterize here so the silhouette
    // keeps its polygon AA. R = premultiplied height (cov*H), G = coverage;
    // RG8 is core-WebGL2 color-renderable + multisample (WaterRenderer uses an
    // RGBA8 MSAA buffer, so the path is proven on this GPU).
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

    // Single-sample resolve target — this is what receivers sample. LINEAR +
    // no mipmaps: R/G is exact under linear filtering (premultiplied identity),
    // so the resolved edge carries a clean, anti-aliased coverage in G.
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

  // Binds the mask, clears it to coverage 0 (G=0 = the "no caster" sentinel),
  // and sets no-blend / no-depth state. Casters are drawn bottom-to-top and
  // simply overwrite, so the topmost caster covering a texel wins (MSAA
  // handles its edge); no MAX-blend, so overlaps no longer leave an outline.
  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); // R=0,G=0 -> nothing casts here
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Resolves the multisampled mask into the sampleable LINEAR texture, turning
  // each caster's polygon coverage into the ~1px smooth edge the receiver reads.
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
