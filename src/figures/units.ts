// Figure constants, expressed in WORLD UNITS (see `lib/worldScale`).
//
// A figure's drawing area is always REF_WIDTH units wide and REF_WIDTH/aspect
// units tall, whatever its pixel size, and the host installs the units -> device
// transform once per resize. So a sketch never sees a pixel and never carries a
// scale factor: `26` means the same fraction of the figure on a phone and on a
// laptop, and a phone figure is an exact scaled-down copy of the desktop one.
//
// This replaced two disagreeing systems: a clamped `figureScreenScale` that was
// pinned at 0.6 for every figure on every device (the clamp floor only lifted
// above 864px, but the content column caps figures at ~640px), and an unclamped
// `figureSceneRatio` used only by the shadow path. Text and fish rode the dead
// clamp while geometry and shadows tracked the canvas, so labels read ~1.8x
// larger against the scene on a phone than on a laptop.

import { REF_WIDTH } from "@/lib/worldScale";

export { REF_WIDTH };

export const FIGURE_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
// ~5.5% of the height of a 2.4-aspect figure.
export const FIGURE_FONT_SIZE = 33;

// Canonical fish size a figure shows. Dimensionless individuality handed to
// `Fish`, which applies the view scale itself — never premultiply.
// Production FISH_SCALE_MEAN is 0.475 across a school of 6; figures show one
// or two koi and want a fuller silhouette, so the mean reads slightly larger.
export const FIGURE_FISH_SCALE = 0.74;
export const FIGURE_FISH_MAX = 0.95;

// Lily/lotus/foam radii as fractions of the drawing area's height.
export const FIGURE_LILY_R_FRAC = 0.28;
export const FIGURE_LOTUS_SIZE_FRAC = 0.2;
// Lotus ripple/foam radius as a fraction of the outermost-petal reach;
// mirrors Lotuses.RIPPLE_RADIUS_FRAC.
export const FIGURE_FOAM_FRAC = 0.6;

export function figureFont(sizeUnits: number = FIGURE_FONT_SIZE): string {
  return `${sizeUnits}px ${FIGURE_FONT_FAMILY}`;
}
