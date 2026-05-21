#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;  // offscreen FBO with the lily + lotus on transparent bg
uniform vec2 u_res;         // panel size, px (logical)
uniform float u_time;
// Water colour + tint factors, pushed from TS — same single source as the
// production WaterRenderer / water.frag.glsl (BG_DARK in frame.ts, DEEP_DARK /
// SHEEN / RIPPLE_CREST in WaterRenderer.ts).
uniform vec3 u_bg;          // scene clear / water base
uniform vec3 u_deep;        // sheen tint target
uniform float u_sheen;      // mix(bg, deep, sheen) gives the toon water tone
uniform float u_rippleCrest;// brightness boost added by foam + ring mask

// Foam disks (lily + lotus) + crest-ring math, shared with shadows-on-off.
#include "../../../../../render/shaders/figureFoamRing.glsl"
// Wiper bar + accent grab dot, shared with shadows-on-off.
#include "../../../../../render/shaders/wiperHandle.glsl"

out vec4 o;

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // Scene texture: the lily + lotus rendered on transparent bg. Sampled at the
  // unrefracted uv on BOTH sides — neither flower sits below the water.
  vec4 scene = texture(u_scene, v_uv);

  // FLAT SIDE — just the bare clear colour the production scene starts at,
  // with the lily/lotus composited on top. No SHEEN, no foam, no ripples.
  vec3 flatCol = mix(u_bg, scene.rgb, scene.a);

  // TOON SIDE — production formula: scene colour mixed toward u_deep by
  // u_sheen, then foam + ring added as a brightness boost in water pixels.
  vec3 toonCol = mix(u_bg, scene.rgb, scene.a);
  toonCol = mix(toonCol, u_deep, u_sheen);

  float foam, ring;
  computeFoamRing(px, u_time, foam, ring);
  float waterMask = 1.0 - scene.a;
  toonCol += max(foam, ring) * waterMask * u_rippleCrest;

  // Wiper composite.
  float wiperPx = u_wiper * u_res.x;
  float wiperT = smoothstep(wiperPx - FFR_AA_PX, wiperPx + FFR_AA_PX, px.x);
  vec3 col = mix(flatCol, toonCol, wiperT);
  col = applyWiperHandle(col, px, u_res);

  o = vec4(col, 1.0);
}
