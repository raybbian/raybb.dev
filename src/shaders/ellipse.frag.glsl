#version 300 es
precision mediump float;
in vec4 v_color;
uniform float u_depth; // owning fish's submergence (same value as the body)
uniform highp vec2 u_res; // logical px (shared w/ vertex stage -> match highp)
uniform vec2 u_fragRes;   // drawing-buffer px
#include "shadow.glsl"
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth;

void main() {
  o_depth = vec4(u_depth, 0.0, 0.0, 1.0);
  if (u_shadowDebug > 0.5) {
    o = vec4(shadowDebugRGB(gl_FragCoord.xy / u_fragRes), 1.0);
    return;
  }
  float s = mix(1.0, 1.0 - u_shadowDark, shadowHit(gl_FragCoord.xy / u_fragRes));
  o = vec4(v_color.rgb * s, v_color.a);
}
