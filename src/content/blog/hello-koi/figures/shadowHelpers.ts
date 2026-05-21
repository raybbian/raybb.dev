// Canvas-relative shadow uniforms for the hello-koi figures.
//
// Production WaterRenderer (FishBackground.tsx) uploads the raw ShadowRenderer
// constants because its canvas spans the viewport — at 1440px wide,
// SHADOW_K=138 px is 9.6% of the canvas, and that's the calibrated look.
// Figures live in a fixed-aspect box at varying widths, so the same raw
// constant lands ~2× too wide on mobile. We scale every shadow value by
// `shadowScale = width / 1440` (unclamped — `figureSceneRatio`) so the
// shadow holds the SAME canvas fraction at every figure size.
//
// IMPORTANT: the cast pass (LilypadRenderer.cast/LotusRenderer.cast) and
// the shadow FBO margin (ShadowRenderer.resize) must use the SAME scale,
// otherwise the caster pre-shift and the receiver lookup use different K
// values and the shadow lands in the wrong place (much larger than either
// alone). Each of those APIs takes an optional `shadowScale` arg — pass
// the same `figureSceneRatio(w)` to all three.
//
// Other posts don't render shadows, so these wrappers live under the post
// rather than in the shared src/figures/* surface.

import {
  SHADOW_K,
  shadowMargin as rawShadowMargin,
  shadowSunDir as rawShadowSunDir,
} from "@/render/ShadowRenderer";
import { figureSceneRatio } from "@/figures/scale";

// Base wavy gain (logical px) for lily/lotus casters in figures at
// shadowScale=1 (canvas width = 1440px), matching the previous in-shader const.
export const FIGURE_SHADOW_WAVY_BASE_PX = 100;

// Convenience: derive the scale from canvas width. Use this in figure
// `resize` so every shadow consumer in this figure sees the same number.
export function figureShadowScale(width: number): number {
  return figureSceneRatio(width);
}

export function figureShadowK(shadowScale: number): number {
  return SHADOW_K * shadowScale;
}

export function figureShadowMargin(shadowScale: number): [number, number] {
  const [mx, my] = rawShadowMargin();
  return [mx * shadowScale, my * shadowScale];
}

// Sun direction is dimensionless (unit-ish vector); passthrough.
export function figureShadowSunDir(themeMix: number): [number, number] {
  return rawShadowSunDir(themeMix);
}

export function figureShadowWavyPx(
  shadowScale: number,
  base: number = FIGURE_SHADOW_WAVY_BASE_PX,
): number {
  return base * shadowScale;
}

// One-shot uploader so every shadow-using figure has a single obvious call.
// Mirrors WaterRenderer.composite's upload block, but scaled.
export interface FigureShadowLocs {
  sunDir: WebGLUniformLocation;
  shadowMargin: WebGLUniformLocation;
  shadowK: WebGLUniformLocation;
  shadowWavyPx?: WebGLUniformLocation;
}

export function applyFigureShadowUniforms(
  gl: WebGL2RenderingContext,
  locs: FigureShadowLocs,
  shadowScale: number,
  themeMix: number,
): void {
  const sd = figureShadowSunDir(themeMix);
  gl.uniform2f(locs.sunDir, sd[0], sd[1]);
  const [mx, my] = figureShadowMargin(shadowScale);
  gl.uniform2f(locs.shadowMargin, mx, my);
  gl.uniform1f(locs.shadowK, figureShadowK(shadowScale));
  if (locs.shadowWavyPx) {
    gl.uniform1f(locs.shadowWavyPx, figureShadowWavyPx(shadowScale));
  }
}
