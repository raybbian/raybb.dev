#version 300 es
precision mediump float;
in vec2 v_local;  // A=(0,-1) base-, B=(0,1) base+, C=(1,0) tip
in vec3 v_color;
in vec3 v_colorDark;
in float v_seed;
uniform float u_theme; // 0 = dark pond, 1 = light pond (eased on theme change)
// "Squircle for a triangle": blending the triangle SDF toward a circle SDF
// bows the three sides convexly outward (not just the corners). u_bulge 0 =
// sharp triangle, 1 = circle. The renderer pins this to 0.55 in production;
// figures (lotus-petal-mix) drive it from a slider.
uniform float u_bulge;
out vec4 o;

const float CIRCLE_R = 0.66;
const vec2 CIRCLE_C = vec2(0.3333, 0.0); // centroid of A,B,C
const float ALPHA_CUT = 0.01;
const float TIP_START = 0.55;
const float TIP_SAT = 1.5;

// Signed distance to a triangle (iq, 2D). Negative inside.
float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(
      vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
      vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
      vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  float dTri = sdTriangle(v_local, vec2(0.0, -1.0), vec2(0.0, 1.0),
                          vec2(1.0, 0.0));
  float dCir = length(v_local - CIRCLE_C) - CIRCLE_R;
  float d = mix(dTri, dCir, u_bulge);
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(-aa, aa, d);
  if (a < ALPHA_CUT) discard;

  // Flat colour (no gradient -> no per-petal rim/outline); per-petal tint
  // jitter so neighbours don't read as one flat mass.
  float along = clamp(v_local.x, 0.0, 1.0);
  float jitter = 1.0 + (sin(v_seed) * 0.5) * 0.06;
  vec3 c = mix(v_colorDark, v_color, u_theme) * jitter;
  float sat = mix(1.0, TIP_SAT, smoothstep(TIP_START, 1.0, along));
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, sat);

  o = vec4(clamp(c, 0.0, 1.0), a);
}
