// Tileable noise sampler shared by every shader that reads the pre-baked
// noise texture (see src/render/noiseTexture.ts). Centralized here so the
// uniform declaration lives in exactly one place: shadow.glsl and
// waterNoise.glsl both #include this so they can co-exist in the same
// compiled shader without redeclaring u_noise. The GLSL loader's per-resolve
// dedupe (glsl-loader.cjs) drops the second include automatically.
uniform sampler2D u_noise;
