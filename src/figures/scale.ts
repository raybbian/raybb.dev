// Canvas-relative sizing for blog figures. Mirrors the production pond's
// `screenScale` (FishBackground.tsx) so a fish, lily, lotus, foam disk, etc.
// reads as the same fraction of every figure canvas, regardless of viewport.
//
// Use figureScreenScale(width) to drive Fish/Lotuses/Treats/Ripples scaling.
// Use the FIGURE_* fractions when laying out the lily/lotus/foam radii.
//
// Scene-rendering pixel constants (text, stroke widths on rendered scene
// geometry, shadow offsets) must go through `figurePx` / `figureFont` (here)
// or the post-specific shadow wrappers. UI affordances — slider knobs/tracks,
// divider widths, draggable grabber radii, arrow heads, hit-test tolerances —
// stay at constant logical px so touch targets remain usable at every size.

export const REF_WIDTH = 1440; // viewport width at which sizes are 1x
const SCREEN_SCALE_MIN = 0.6;
const SCREEN_SCALE_MAX = 1.4;

// Clamped scale for things that must stay legible / hit-testable even on a
// narrow figure: text, fish size, dot/line widths. The clamp keeps mobile
// figures from shrinking labels to unreadable sizes.
export function figureScreenScale(width: number): number {
  const s = width / REF_WIDTH;
  return s < SCREEN_SCALE_MIN
    ? SCREEN_SCALE_MIN
    : s > SCREEN_SCALE_MAX
      ? SCREEN_SCALE_MAX
      : s;
}

// UNCLAMPED canvas ratio for "scene fraction" values — the shadow K, shadow
// margin, and shadow wavy gain. These must hold a CONSTANT fraction of the
// canvas at every viewport, just like production at 1440 (9.6% of canvas).
// Clamping would break that fraction at narrow widths, which is what made
// the figure shadow read ~2× too wide on mobile. A small floor keeps the
// math finite if a figure briefly resizes to ~0.
export function figureSceneRatio(width: number): number {
  const s = width / REF_WIDTH;
  return s < 0.05 ? 0.05 : s;
}

// Font + scene-px helpers. The host (`src/components/Figure.tsx`) computes
// screenScale once per resize and hands it to every sketch; sketches then
// route every scene-rendering literal through these so the figures shrink/
// grow proportionally with the canvas.
export const FIGURE_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
// Base size before screenScale. Calibrated to read comfortably at REF_WIDTH
// (where screenScale clamps to 1) and at narrow widths where screenScale
// clamps to 0.6 (~10px effective).
export const FIGURE_FONT_BASE_PX = 16;

export function figureFont(
  screenScale: number,
  basePx: number = FIGURE_FONT_BASE_PX,
): string {
  return `${Math.round(basePx * screenScale)}px ${FIGURE_FONT_FAMILY}`;
}

export function figurePx(screenScale: number, basePx: number): number {
  return basePx * screenScale;
}

// Canonical fish scale a figure shows on top of screenScale. Production
// FISH_SCALE_MEAN is 0.475 across a school of 6; figures show one or two
// koi and want a fuller silhouette, so the mean reads slightly larger.
export const FIGURE_FISH_SCALE = 0.55;
export const FIGURE_FISH_MAX = 0.7;

// Lily/lotus/foam radii expressed as fractions of panel height (they were
// already declared this way in flatVsToon/waterRefract; centralized so the
// figures stay visually consistent with each other).
export const FIGURE_LILY_R_FRAC = 0.28;
export const FIGURE_LOTUS_SIZE_FRAC = 0.20;
// Lotus ripple/foam radius as a fraction of the outermost-petal reach;
// mirrors Lotuses.RIPPLE_RADIUS_FRAC.
export const FIGURE_FOAM_FRAC = 0.6;
