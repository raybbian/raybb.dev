import { Fish, type FishColors } from "@/sim/Fish";
import type { Vec2 } from "@/lib/math";

export interface FigureFishOpts {
  origin: Vec2;
  colors: FishColors;
  // Dimensionless individuality; `Fish` applies the view scale itself.
  sizeScale: number;
  maxSizeScale?: number; // defaults to `sizeScale` (no growth)
  depth?: number; // default 0.4 — fixed submergence (no bob)
  seed: number;
  noisePhase?: {
    heading?: number;
    speed?: number;
    mouth?: number;
  };
  cruiseSpeed?: number;
  turnRateMult?: number;
}

// Wraps the positional `new Fish(...)` constructor with a named-options
// object. Sketches that just need "a fish at (origin), this size, this
// color, this seed" go through here.
export function createFigureFish(opts: FigureFishOpts): Fish {
  return new Fish(
    opts.origin,
    opts.colors,
    opts.depth ?? 0.4,
    opts.sizeScale,
    {
      noisePhaseHeading: opts.noisePhase?.heading,
      noisePhaseSpeed: opts.noisePhase?.speed,
      noisePhaseMouth: opts.noisePhase?.mouth,
      seed: opts.seed,
      cruiseSpeed: opts.cruiseSpeed,
      turnRateMult: opts.turnRateMult,
    },
    // Figures draw in world units, so one unit is one world unit: 1.
    1,
    opts.maxSizeScale ?? opts.sizeScale,
  );
}
