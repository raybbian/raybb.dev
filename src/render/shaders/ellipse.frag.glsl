#version 300 es
precision mediump float;
in vec4 v_color;
uniform float u_depth; // owning fish's submergence (same value as the body)
uniform highp vec2 u_res; // logical px (shared w/ vertex stage -> match highp)
uniform vec2 u_fragRes;   // drawing-buffer px
uniform float u_time;     // seconds, for the wavy-shadow displacement
uniform float u_scale;    // worldScale: matches fish.frag's churn scaling
#include "shadow.glsl"
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth;

// Match fish.frag.glsl so the cast shadow churns identically across body and
// fins (a straight fin edge next to a wavy body edge would read wrong).

void main() {
  o_depth = vec4(u_depth, 0.0, 0.0, 1.0);
  if (u_shadowDebug > 0.5) {
    o = vec4(shadowDebugWavyDepth(gl_FragCoord.xy / u_fragRes, u_time, u_depth,
                                  u_scale),
             1.0);
    return;
  }
  vec2 suv = gl_FragCoord.xy / u_fragRes;
  float s = mix(1.0, 1.0 - u_shadowDark,
                shadowHitWavyDepth(suv, u_time, u_depth, u_scale));
  o = vec4(v_color.rgb * s, v_color.a);
}
