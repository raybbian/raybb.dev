#version 300 es
precision mediump float;

#define BLACK_THRESHOLD 2.75

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform sampler2D uCellColors;
uniform float uAntialiasStrength;
uniform vec3 uOutlineColor;

void main() {
    vec3 color = texture(uTexture, vTexCoord).xyz;
    float sumColor = color.x + color.y + color.z;
    if (sumColor < BLACK_THRESHOLD) {
        fragColor = vec4(uOutlineColor, 1.0);
    } else {
        float outlineAlpha = 1.0 - smoothstep(BLACK_THRESHOLD, BLACK_THRESHOLD + uAntialiasStrength, sumColor);
        vec3 oriCol = texture(uCellColors, vTexCoord).xyz;
        vec3 newCol = uOutlineColor * outlineAlpha + oriCol * (1.0 - outlineAlpha);

        fragColor = vec4(newCol, 1.0);
    }
}
