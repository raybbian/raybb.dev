#version 300 es
precision mediump float;
// Displacement bake (one of two W4 passes). Outputs the per-pixel push the
// ripple contributes to refraction lookup. The FBO uses additive blending
// so overlapping ripples sum (mirrors `offsetPx += ...` in the old per-pixel
// composite loop). Texture format is RG16F so signed values blend correctly.
in vec2 v_local;
flat in vec4 v_a;          // (cx, cy, radius, rot)
flat in vec4 v_b;          // (notch, amp, foam, seed)
uniform float u_time;
uniform float u_scale;
out vec2 o_disp;

const float RIPPLE_BAND = 50.0;
const float RIPPLE_FADE = 18.0;
const float RIPPLE_WAVELEN = 42.0;
const float RIPPLE_SPEED = 0.25;
const float RIPPLE_PUSH = 2.5;

float sdRippleSource(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

void main() {
  vec2 d = v_local;
  float dist = length(d);
  if (dist < 1e-3) discard;
  vec2 nd = d / dist;

  float radius = v_a.z;
  float rot = v_a.w;
  float notch = v_b.x;
  float amp = v_b.y;
  float seed = v_b.w;

  float pd = sdRippleSource(d, radius, rot, notch);
  float band = RIPPLE_BAND * u_scale;
  if (pd <= 0.0 || pd >= band) discard;

  float fade = RIPPLE_FADE * u_scale;
  float edgeFade = 1.0 - smoothstep(band - fade, band, pd);
  float wavelen = RIPPLE_WAVELEN * u_scale;
  o_disp = nd * sin((pd / wavelen - u_time * RIPPLE_SPEED + seed) * 6.2831853)
         * RIPPLE_PUSH * u_scale * edgeFade * amp;
}
