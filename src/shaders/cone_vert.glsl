#define MAX_POINTS 1024
#define PI 3.1415926535897932384626433832795
#define CONE_RADIUS 1000.0

attribute vec3 aShapePosition;
attribute vec2 aPosition;
attribute float aIndex;

uniform vec2 uResolution;
uniform float uNumPoints;

varying float vKey;

void main(void) {
    vec3 screenPosition = aShapePosition + vec3(aPosition.xy, 0.0);
    vec3 zeroOnePosition = screenPosition / vec3(uResolution, 1.0);
    vec3 uvPosition = vec3(zeroOnePosition.xy * 2.0 - 1.0, zeroOnePosition.z);

    gl_Position = vec4(uvPosition, 1.0);
    vKey = aIndex / uNumPoints;
}
