#version 300 es
precision mediump float;
in vec4 v_color;
layout(location = 0) out vec4 o;

// Flat ellipse shader for blog figures: no shadow receiver. Used for fins
// and eyes when the figure doesn't want pattern/shadow lighting.
void main() {
  o = v_color;
}
