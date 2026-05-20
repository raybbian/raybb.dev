// Canvas-relative sizing for blog figures. Mirrors the production pond's
// `screenScale` (FishBackground.tsx) so a fish, lily, lotus, foam disk, etc.
// reads as the same fraction of every figure canvas, regardless of viewport.
//
// Use figureScreenScale(width) to drive Fish/Lotuses/Treats/Ripples scaling.
// Use the FIGURE_* fractions when laying out the lily/lotus/foam radii.

const REF_WIDTH = 1440; // viewport width at which sizes are 1x
const SCREEN_SCALE_MIN = 0.6;
const SCREEN_SCALE_MAX = 1.4;

export function figureScreenScale(width: number): number {
  const s = width / REF_WIDTH;
  return s < SCREEN_SCALE_MIN
    ? SCREEN_SCALE_MIN
    : s > SCREEN_SCALE_MAX
      ? SCREEN_SCALE_MAX
      : s;
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
