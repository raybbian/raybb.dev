import type { FigureTheme } from "@/figures/types";

// 250ms full traversal — matches the production FishBackground.tsx pond
// fade and the CSS frost transition.
const FADE_SECONDS = 0.25;

// Eases a 0..1 "theme mix" toward a binary target. 0 = dark, 1 = light.
// Mirrors the easing in src/components/FishBackground.tsx so full-scene
// figures (flatVsToon, waterRefract) fade the same way the real pond does.
export class ThemeMixer {
  mix: number;
  private target: number;

  // initial: which theme the figure mounts in (so the first paint is
  // settled — no fade-in on appearance).
  constructor(initial: FigureTheme = "dark") {
    this.target = themeToMix(initial);
    this.mix = this.target;
  }

  setTarget(theme: FigureTheme): void {
    this.target = themeToMix(theme);
  }

  // Advance the mix toward the target. dt is seconds; clamp on the caller
  // side if you need to (animation loops already do that elsewhere).
  // Returns true when the mix changed this tick.
  advance(dt: number): boolean {
    if (this.mix === this.target) return false;
    const d = this.target - this.mix;
    const step = (dt / FADE_SECONDS) * Math.sign(d);
    this.mix = Math.abs(step) >= Math.abs(d) ? this.target : this.mix + step;
    return true;
  }
}

function themeToMix(t: FigureTheme): number {
  return t === "light" ? 1 : 0;
}

// Component-wise lerp for [r, g, b] tuples. The figure water shaders take
// vec3 u_bg / u_deep — drop alpha if BG_* is RGBA, use this to interpolate.
export function lerpRgb(
  a: readonly number[],
  b: readonly number[],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
