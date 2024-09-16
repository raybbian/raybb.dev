#version 300 es
precision mediump float;

#define PI 3.1415926535897932384626433832795

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uBlurLine;
uniform float uBlurRadius;
uniform float uBlurSamples;

void main() {
    vec4 total = vec4(0);
    vec2 pixelToUV = 1.0 / uResolution;

    float dist = 1.0 / uBlurSamples;
    for (float i = -0.5; i <= 0.5; i += dist) {
        vec2 coord = vTexCoord + i * uBlurLine * pixelToUV * uBlurRadius;
        total += texture(uTexture, coord);
    }
    fragColor = total * dist;
}
