#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_uv;
uniform sampler2D u_pattern; // koi body pattern, baked once (see pattern.frag)
uniform float u_depth;       // this fish's submergence, 0..1 (>0 = "fish here")
uniform highp vec2 u_res; // logical px (shared w/ vertex stage -> match highp)
uniform vec2 u_fragRes;   // drawing-buffer px
uniform float u_time;     // seconds, for the wavy-shadow displacement
uniform float u_scale;    // worldScale: scales wavy-shadow churn to canvas
#include "shadow.glsl"
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth; // R = submergence for the water pass

const float FIN_SENTINEL = -1.0; // v_uv.x below this = fin -> flat v_color
const float SHADOW_SENTINEL = -2000.0; // below this = dorsal self-shadow band
const float U_MIN = -0.125;
const float U_MAX = 1.0 + 1.0 / 30.0;

// The shadow falling ON the fish is baked here; the later water pass shifts
// fish + shadow together, so it can't churn the silhouette relative to the
// body. shadowHitWavyDepth (shadow.glsl) reproduces the water's ambient
// refraction locally, scaled by submergence (deeper -> more churn).

void main() {
  o_depth = vec4(u_depth, 0.0, 0.0, 1.0);
  if (u_shadowDebug > 0.5) {
    o = vec4(shadowDebugWavyDepth(gl_FragCoord.xy / u_fragRes, u_time, u_depth,
                                  u_scale),
             1.0);
    return;
  }
  // Dorsal self-shadow band: black with alpha (SRC_ALPHA blend = darken the
  // body it covers). It is its own correctly-sheared geometry, so it must NOT
  // also read the global mask.
  if (v_uv.x < SHADOW_SENTINEL) { o = vec4(0.0, 0.0, 0.0, v_color.a); return; }
  vec2 suv = gl_FragCoord.xy / u_fragRes;
  float s = mix(1.0, 1.0 - u_shadowDark,
                shadowHitWavyDepth(suv, u_time, u_depth, u_scale));
  if (v_uv.x < FIN_SENTINEL) { o = vec4(v_color.rgb * s, v_color.a); return; }
  vec2 tc = vec2((v_uv.x - U_MIN) / (U_MAX - U_MIN), v_uv.y);
  o = vec4(texture(u_pattern, tc).rgb * s, 1.0);
}
