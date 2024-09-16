#version 300 es
precision mediump float;

#define PI 3.1415926535897932384626433832795

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uNumPoints;
uniform float uOutlineRadius;

void main() {
    vec2 pixelToUV = 1.0 / uResolution;
    vec4 centerColor = texture(uTexture, vTexCoord);
    float maxDelta = 0.0;
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec4 textureColor = texture(uTexture, vTexCoord + vec2(i, j) * pixelToUV * uOutlineRadius);
            float deltaColor = textureColor.x - centerColor.x;
            maxDelta = max(maxDelta, abs(deltaColor));
        }
    }

    //half the color distance, should not miss edges
    if (maxDelta > 1.0 / (uNumPoints * 2.0)) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
}
