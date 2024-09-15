#version 300 es
precision mediump float;

#define BLACK_THRESHOLD 2.75
#define ANTIALIAS_STRENGTH 0.15

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;

void main() {
    vec3 color = texture(uTexture, vTexCoord).xyz;
    float sumColor = color.x + color.y + color.z;
    if (sumColor < BLACK_THRESHOLD) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0 - smoothstep(BLACK_THRESHOLD, BLACK_THRESHOLD + ANTIALIAS_STRENGTH, sumColor));
    }
    // fragColor = vec4(color, 1.0);
}
