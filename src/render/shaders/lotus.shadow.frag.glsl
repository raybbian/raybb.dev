#version 300 es
precision mediump float;
in vec2 v_local; // A=(0,-1) B=(0,1) C=(1,0)
// Caster: replicate lotus.frag's petal so the shadow keeps the real shape.
uniform float u_castHeight;
layout(location = 0) out vec4 o;

const float BULGE = 0.55;
const float CIRCLE_R = 0.66;
const vec2 CIRCLE_C = vec2(0.3333, 0.0);

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
  float d = mix(dTri, dCir, BULGE);
  float aa = fwidth(d);
  if (1.0 - smoothstep(-aa, aa, d) < 0.5) discard;
  o = vec4(u_castHeight, 1.0, 0.0, 0.0); // premultiplied (height, coverage)
}
