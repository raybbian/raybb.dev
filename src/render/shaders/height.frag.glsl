#version 300 es
precision mediump float;
// Caster: R=height, G=1. MSAA resolve gives R=cov*H, G=cov; receiver
// recovers true height via R/G. Geometry is the silhouette (no shape test).
uniform float u_castHeight;
layout(location = 0) out vec4 o;
void main() { o = vec4(u_castHeight, 1.0, 0.0, 0.0); }
