#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_uv;
uniform sampler2D u_pattern; // koi body pattern, baked once (see pattern.frag)
uniform float u_depth;       // this fish's submergence, 0..1 (>0 = "fish here")
uniform highp vec2 u_res; // logical px (shared w/ vertex stage -> match highp)
uniform vec2 u_fragRes;   // drawing-buffer px (canvas.width/height)
#include "shadow.glsl"
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth; // R = submergence for the water pass

const float FIN_SENTINEL = -1.0; // v_uv.x below this = fin -> flat v_color
const float U_MIN = -0.125;
const float U_MAX = 1.0 + 1.0 / 30.0;

void main() {
  o_depth = vec4(u_depth, 0.0, 0.0, 1.0);
  float s = mix(1.0, 1.0 - u_shadowDark, shadowHit(gl_FragCoord.xy / u_fragRes));
  if (v_uv.x < FIN_SENTINEL) { o = vec4(v_color.rgb * s, v_color.a); return; }
  vec2 tc = vec2((v_uv.x - U_MIN) / (U_MAX - U_MIN), v_uv.y);
  o = vec4(texture(u_pattern, tc).rgb * s, 1.0);
}
