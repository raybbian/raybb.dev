// Sampling helpers for the pre-baked tileable noise texture. Production
// water.frag.glsl, rippleMask.frag.glsl, and the blog figures (displacement
// noise, water refraction, flat-vs-toon comparison) all sample through these
// helpers so the magic constants (UV scales, scroll rates) live in exactly
// one place. The texture itself stores RG = curl-noise vector field
// (centered at 0.5) and B = scalar FBM; see src/render/noiseTexture.ts.

#include "noiseSampler.glsl"

// UV scales in "texture periods per u_res.y". The shared noise texture's
// base octave has 8 lattice cells per period, so a scale of 0.375 = 3
// base-octave cells per u_res.y — visually matches the previous FBM
// frequencies the production shaders used before the bake (REFRACT_FREQ
// = 3.0, WIDTH_FREQ = 2.2, FOAM_FREQ = 4.0 in shader/FBM-lattice units).
const float WN_REFRACT_NOISE_SCALE = 0.375;
const float WN_REFRACT_SCROLL = 0.05;
const float WN_WIDTH_NOISE_SCALE = 0.275;
const float WN_FOAM_NOISE_SCALE = 0.5;
// Time-scroll rates the production water shader animated FBM at; reused
// here so the figures' foam/crest evolve at exactly the same pace.
const float WN_FOAM_SPEED = 0.5;
const float WN_WIDTH_SPEED = 0.2;

// Ambient refraction offset in logical px (replaces the per-frame refract
// pass that used to bake a quarter-res FBM-difference field).
//   `px`         top-down pixel coord, matching the water shader's
//                vec2(v_uv.x, 1.0 - v_uv.y) * u_res convention.
//   `res`        logical px (the same u_res the host shader uses).
//   `pxStrength` peak |offset| in px (production uses REFRACT_PX * u_scale;
//                figures pass their own REFRACT_STRENGTH).
vec2 wn_refractOffset(vec2 px, vec2 res, float time, float pxStrength) {
  vec2 nuv = px / res.y * WN_REFRACT_NOISE_SCALE
           + vec2(time * WN_REFRACT_SCROLL, time * WN_REFRACT_SCROLL * 0.7);
  return (texture(u_noise, nuv).rg - 0.5) * 2.0 * pxStrength;
}

// Foam collar width-variation noise in [0, 1). One LINEAR texture read
// replaces the 3-octave FBM the production loop used to run per ripple
// per pixel. `nd` is the unit direction from the ripple center; `seed`
// is the per-source identity so each ripple's foam pattern stays distinct.
float wn_foamWidthNoise(vec2 nd, float seed, float time) {
  vec2 fnuv = nd * WN_FOAM_NOISE_SCALE + vec2(seed, time * WN_FOAM_SPEED);
  return texture(u_noise, fnuv).b;
}

// Crest-ring width-variation noise in [0, 1). `pdRef` = SDF distance in
// reference px (caller divides scaled pd by u_scale so the per-ring pattern
// looks identical at any screen scale); `widthRadial` decorrelates
// successive rings in 1/px.
float wn_crestWidthNoise(vec2 nd, float seed, float pdRef,
                         float widthRadial, float time) {
  vec2 wnuv = nd * WN_WIDTH_NOISE_SCALE
            + vec2(seed + pdRef * widthRadial, time * WN_WIDTH_SPEED);
  return texture(u_noise, wnuv).b;
}
