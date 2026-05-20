#version 300 es
precision mediump float;
in vec2 v_local;   // (along, across) in px
in float v_len;
in float v_width;
in vec4 v_color;
out vec4 o;

// Thin shaft + triangular arrowhead. Head length is the smaller of a fixed
// allowance and one-third of the total length, so short arrows still look
// like arrows instead of pure triangles.
void main() {
  float headLen = min(10.0, v_len * 0.5);
  float shaftLen = max(v_len - headLen, 0.0);
  float a = v_local.x;
  float c = abs(v_local.y);
  float aa = max(fwidth(c), 1.0);
  // Shaft: |across| <= halfWidth for a in [0, shaftLen].
  float shaft = (1.0 - smoothstep(v_width - aa, v_width + aa, c))
              * step(0.0, a)
              * (1.0 - step(shaftLen, a));
  // Arrowhead: |across| <= halfHead * (1 - t) where t = (a - shaftLen)/headLen.
  float headHalf = max(v_width * 2.2, 4.0);
  float t = clamp((a - shaftLen) / max(headLen, 1e-3), 0.0, 1.0);
  float headEdge = headHalf * (1.0 - t);
  float head = (1.0 - smoothstep(headEdge - aa, headEdge + aa, c))
             * step(shaftLen, a)
             * (1.0 - step(v_len, a));
  float mask = max(shaft, head);
  float alpha = mask * v_color.a;
  if (alpha <= 0.0) discard;
  o = vec4(v_color.rgb, alpha);
}
