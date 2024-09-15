#version 300 es
precision mediump float;

in vec2 aPosition;
out vec2 vTexCoord;

void main() {
    // Pass the position directly to the fragment shader
    vTexCoord = (aPosition + 1.0) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
