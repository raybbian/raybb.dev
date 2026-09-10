// The one place that decides how big the world is on a given view.
//
// Every length in `src/sim` and `src/render` is authored in WORLD UNITS: one
// unit is one CSS px at REF_WIDTH. `worldScale(width)` turns a view's width
// into px-per-unit, so a scene holds identical proportions at any size, and a
// view is always REF_WIDTH units wide no matter how many pixels it occupies.
//
// Both the production pond (`components/FishBackground`) and the blog figures
// (`components/Figure`) take their scale from here. There is deliberately no
// second scaling system: before this existed, figures ran their own clamped
// `figureScreenScale` alongside an unclamped `figureSceneRatio`, the two
// disagreed by ~1.8x on a phone, and text/fish drifted out of proportion with
// the geometry around them.
//
// Production spans the whole viewport, whose width is unbounded, so it opts
// into `clampedWorldScale`: the school would otherwise shrink to confetti on a
// phone and swell on a 4k monitor. Figures sit in a fixed-aspect box and want
// pure proportionality — a phone figure is an exact scaled-down copy of the
// desktop one — so they use `worldScale` unclamped.

export const REF_WIDTH = 1440;

export const WORLD_SCALE_MIN = 0.6;
export const WORLD_SCALE_MAX = 1.4;

// Keeps the conversion finite while a view is still measuring zero, without
// being large enough to show up as a visible size floor.
const EPSILON_SCALE = 0.05;

// px per world unit. Pure ratio — use for anything that must hold a constant
// fraction of its view.
export function worldScale(width: number): number {
  const s = width / REF_WIDTH;
  return s < EPSILON_SCALE ? EPSILON_SCALE : s;
}

// px per world unit, bounded for views whose width is unbounded (the viewport).
export function clampedWorldScale(width: number): number {
  const s = width / REF_WIDTH;
  return s < WORLD_SCALE_MIN
    ? WORLD_SCALE_MIN
    : s > WORLD_SCALE_MAX
      ? WORLD_SCALE_MAX
      : s;
}

// Size of a view expressed in world units. Width is always REF_WIDTH; height
// follows from the view's aspect. Sketches lay out against these.
export function viewUnits(aspect: number): { w: number; h: number } {
  return { w: REF_WIDTH, h: REF_WIDTH / aspect };
}
