#version 300 es
precision mediump float;

#define MAX_POINTS 1024
#define PI 3.1415926535897932384626433832795
#define CONE_RADIUS 1000.0

uniform vec2 uResolution;
uniform float uNumPoints;
uniform float uUseColor;

in vec3 aShapePosition;
in vec2 aPosition;
in vec3 aColor;
in float aIndex;

out vec3 vColor;

void main(void) {
    vec3 screenPosition = aShapePosition + vec3(aPosition.xy, 0.0);
    vec3 zeroOnePosition = screenPosition / vec3(uResolution, 1.0);
    vec3 uvPosition = vec3(zeroOnePosition.xy * 2.0 - 1.0, zeroOnePosition.z);

    gl_Position = vec4(uvPosition, 1.0);

    // 0.0 for key, 1.0 for actual color
    if (uUseColor < 0.5) {
        float key = aIndex / uNumPoints;
        vColor = vec3(key, key, key);
    } else {
        vColor = aColor;
    }
}
