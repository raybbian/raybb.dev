#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;  // offscreen FBO with lily + lotus on transparent bg
uniform vec2 u_res;         // panel size, px (logical)
uniform float u_time;
// Water palette — same single source as flat-vs-toon (BG_DARK / DEEP_DARK /
// SHEEN / RIPPLE_CREST). Both panels are the toon water; the wiper only
// toggles the cast-shadow contribution.
uniform vec3 u_bg;
uniform vec3 u_deep;
uniform float u_sheen;
uniform float u_rippleCrest;

// Foam disks + crest-ring math (declares MAX_DISKS, u_diskCount, u_disks,
// u_notch, u_seed and exposes computeFoamRing).
#include "../../../../../render/shaders/figureFoamRing.glsl"
// Heightmap sampler. Declares u_shadow, u_sunDir, u_shadowMargin,
// u_shadowK, u_shadowDark, u_shadowBias, u_shadowFade, u_recvHeight,
// u_surfaceH, u_shadowDebug and exposes shadowHit(uv).
#include "../../../../../render/shaders/shadow.glsl"
// Wiper bar + accent grab dot (declares u_wiper, u_handleDot).
#include "../../../../../render/shaders/wiperHandle.glsl"

// Px gain for the wavy shadow on the water surface. Uploaded as a uniform
// (figureShadowWavyPx) so the wobble amplitude scales with canvas width —
// at worldScale=1 this is ~100 px, matching production roughly.
uniform float u_shadowWavyPx;

out vec4 o;

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec4 scene = texture(u_scene, v_uv);

  // Toon water + foam/crest — same formula as flat-vs-toon's right side.
  vec3 waterCol = mix(u_bg, scene.rgb, scene.a);
  waterCol = mix(waterCol, u_deep, u_sheen);
  float foam, ring;
  computeFoamRing(px, u_time, foam, ring);
  float waterMask = 1.0 - scene.a;
  waterCol += max(foam, ring) * waterMask * u_rippleCrest;

  // Heightmap-driven cast shadow on the water surface. shadowHitWavyAuto
  // perturbs the lookup with the shared curl-noise field so the silhouette
  // dances with the water's refraction (same trick the production water
  // shader uses, just self-driven instead of fed an external refract field).
  // Gated by waterMask so the lily/lotus silhouettes on top stay lit.
  float hit = shadowHitWavyAuto(v_uv, u_time, u_shadowWavyPx) * waterMask;
  vec3 shadowedCol = waterCol * (1.0 - u_shadowDark * hit);

  // Wiper composite: no-shadow on the left, with-shadow on the right.
  float wiperPx = u_wiper * u_res.x;
  float wiperT = smoothstep(wiperPx - FFR_AA_PX, wiperPx + FFR_AA_PX, px.x);
  vec3 col = mix(waterCol, shadowedCol, wiperT);
  col = applyWiperHandle(col, px, u_res);

  o = vec4(col, 1.0);
}
