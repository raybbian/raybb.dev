#version 300 es
precision mediump float;
// Shadow-caster pass: emit premultiplied (height, coverage). Used with
// fish.vert (body mesh) and ellipse.vert (fins) — the geometry itself is the
// silhouette, no shape test needed. R=height, G=1 (covered); MSAA resolve then
// gives R=cov*H, G=cov so the receiver recovers true height via R/G.
uniform float u_castHeight;
layout(location = 0) out vec4 o;
void main() { o = vec4(u_castHeight, 1.0, 0.0, 0.0); }
