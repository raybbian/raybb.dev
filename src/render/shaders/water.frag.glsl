#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform highp vec2 u_res; // highp: shadow sample coord + fwidth AA need it
uniform float u_time;
uniform float u_scale;     // screenScale: px-unit constants scale like sizes
uniform vec3 u_deep;       // deep-water tint target
uniform float u_theme;     // 0 = dark pond, 1 = light pond
// Pre-baked ripple textures (W4): mask is max-blended across overlapping
// ripples; displacement is float (RG16F) and additively blended.
// Drawn by WaterRenderer.composite() as two cheap instanced quad passes
// before this composite reads them.
uniform sampler2D u_rippleMask;     // R = max(foam, ring) * amp
uniform sampler2D u_rippleDisp;     // RG = sum of per-ripple displacement (px)
uniform sampler2D u_fishDepth;      // R = fish submergence, 0 = open water
// Pushed from WaterRenderer.ts (u_sheen, u_rippleCrest). Uniforms instead of
// inlined `const float`s so the figure shaders can read the same TS-side
// constants without mirroring a number into a second file.
uniform float u_sheen;
uniform float u_rippleCrest;
#include "shadow.glsl"
// Refraction-displacement helper (wn_refractOffset). shadow.glsl already
// brought u_noise in via noiseSampler.glsl; waterNoise.glsl includes the
// same file, deduped by the loader.
#include "waterNoise.glsl"
out vec4 o;

// Subtle ambient drift (the per-pixel "wobble" of the floor, not the per-
// ripple push). RIPPLE_PUSH in rippleDisp.frag.glsl handles the visible
// ring-driven displacement; this just keeps open water from looking glassy.
const float REFRACT_PX = 2.0;

// Subtle extra wobble on the cast-shadow lookup beyond what the water
// itself already shifts. Above-water casters (lilypads/lotuses) used to
// double-up their shadow churn with WAVY_GAIN=2.0 (=3x the water's own
// shift after the suv displacement adds in); cut to a light touch so the
// pad shadows mostly track the water naturally.
const float WAVY_GAIN = 0.5;
const vec3 SHADOW_COOL = vec3(0.05, 0.16, 0.28);
const float COOL_AMT = 0.25;
// Light-pond variants: a soft cool dimming instead of a deep blue, so a
// shadowed patch under text stays bright. Lerped by u_theme at the use site.
const vec3 SHADOW_COOL_L = vec3(0.41, 0.57, 0.62);
const float COOL_AMT_L = 0.18;

// Submergence s in (0,1]: 0 = open water (no fish), small = near surface,
// large = deep.
const vec3 DEEP_BLUE = vec3(0.04, 0.20, 0.42);
const float DEPTH_TINT = 0.45;
const vec3 DEEP_BLUE_L = vec3(0.34, 0.58, 0.66);
const float DEPTH_TINT_L = 0.30;
// Dark pond only: extra tint that grows with depth (super-linear), so deep
// koi sink into the gloom faster. 0 at the surface, +this*fdC of the dark
// tint at full submergence; lerped out (-> 0) toward the light pond.
const float DEPTH_TINT_DEEP = 0.9;
const float SHALLOW_GAIN = 2.0;
const float SHALLOW_IN = 0.08;  // s where the refraction boost ramps in
const float SHALLOW_PEAK = 0.22;
const float DEEP_CALM = 0.62;   // s by which the surface is calm again

void main() {
  // Top-down px coords (matches sim pad coords): v flipped.
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // Ambient refraction: one sample of the shared baked noise texture.
  // Replaces the per-frame refract bake; centralized in waterNoise.glsl so
  // figures sample the field through the same helper.
  vec2 offsetPx = wn_refractOffset(px, u_res, u_time, REFRACT_PX * u_scale);

  // A fish near the surface bulges the water above it; a deep one leaves it
  // calm. Hump in depth space (ramp at SHALLOW_IN, peak, fade by DEEP_CALM).
  float fd = texture(u_fishDepth, v_uv).r; // 0 = no fish here
  float shallow = smoothstep(0.0, SHALLOW_IN, fd)
                * (1.0 - smoothstep(SHALLOW_PEAK, DEEP_CALM, fd));
  offsetPx *= 1.0 + shallow * SHALLOW_GAIN;

  // Per-ripple foam/crest mask + push: pre-baked by the W4 ripple bake
  // passes into two textures. One sample apiece replaces the per-pixel
  // loop over up to MAX_RIPPLES sources.
  float mask = texture(u_rippleMask, v_uv).r;
  offsetPx += texture(u_rippleDisp, v_uv).rg;

  vec2 suv = v_uv + offsetPx / u_res;
  vec3 col = texture(u_scene, suv).rgb;
  col = mix(col, u_deep, u_sheen);
  // Sample depth along the refracted lookup so the tint tracks the displaced
  // fish, not its undisturbed cell.
  float fdC = texture(u_fishDepth, suv).r;
  // Dark mode steepens the falloff with depth; light mode stays linear.
  float depthAmt = fdC * mix(DEPTH_TINT, DEPTH_TINT_L, u_theme)
                 * (1.0 + mix(DEPTH_TINT_DEEP, 0.0, u_theme) * fdC);
  col = mix(col, mix(DEEP_BLUE, DEEP_BLUE_L, u_theme),
            clamp(depthAmt, 0.0, 1.0));
  col += mask * u_rippleCrest;
  // Fish are already shadowed in their own pass (baked into u_scene), so
  // exclude them (fd > 0) here to avoid double-darken. The wavy variant adds
  // an extra refract+ripple offset on top of suv so the silhouette moves
  // relative to the floor it sits on.
  float hit = shadowHitWavy(suv, offsetPx * WAVY_GAIN);
  float openWater = 1.0 - smoothstep(0.0, 0.04, fdC);
  float sh = hit * openWater;
  // Cool, dimmed shadow instead of a flat grey multiply. The light pond
  // uses a softer cool tint and a gentler darken so cast shadows don't
  // punch dark holes a pale koi would otherwise hide a glyph behind.
  vec3 shadowed = mix(col, mix(SHADOW_COOL, SHADOW_COOL_L, u_theme),
                      mix(COOL_AMT, COOL_AMT_L, u_theme))
                * (1.0 - u_shadowDark * mix(1.0, 0.5, u_theme));
  col = mix(col, shadowed, sh);
  o = vec4(col, 1.0);
}
