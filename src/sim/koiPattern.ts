export type Rgba = [number, number, number, number];

export interface KoiColors {
  base: Rgba;
  mid: Rgba;
  accent: Rgba;
  fin: Rgba; // slightly darker than base; flat fin color
  seed: [number, number];
}

// Seeded PRNG so each page load is deterministic given its seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hslToRgb(h: number, s: number, l: number): Rgba {
  const k = (n: number) => (n + h * 12) % 12;
  const f = (n: number) =>
    l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4), 1];
}

// Hue/sat/light ranges per koi pigment family; jittered per fish.
const BASE_FAMILIES: [number, number, number, number, number, number][] = [
  [0.0, 0.0, 0.0, 0.06, 0.93, 1.0], // porcelain white
  [0.09, 0.13, 0.2, 0.35, 0.84, 0.92], // warm cream
];
const MID_FAMILIES: [number, number, number, number, number, number][] = [
  [0.99, 0.03, 0.7, 0.9, 0.45, 0.56], // hi red
  [0.05, 0.08, 0.8, 0.95, 0.5, 0.6], // persimmon orange
];
const ACCENT_FAMILIES: [number, number, number, number, number, number][] = [
  [0.0, 0.0, 0.0, 0.05, 0.05, 0.13], // sumi black
  [0.62, 0.68, 0.25, 0.45, 0.16, 0.26], // deep indigo
];

const FIN_DARKEN = 0.82; // fin tone = base * this (toward black)
const SEED_SCALE = 1000; // shader noise-field offset spread

function pick(
  rng: () => number,
  fams: [number, number, number, number, number, number][],
): Rgba {
  const [hLo, hHi, sLo, sHi, lLo, lHi] =
    fams[Math.floor(rng() * fams.length)];
  const lerp = (lo: number, hi: number) => lo + rng() * (hi - lo);
  return hslToRgb(lerp(hLo, hHi), lerp(sLo, sHi), lerp(lLo, lHi));
}

// Tones rgb down toward black, preserving alpha.
function darken([r, g, b, a]: Rgba, f: number): Rgba {
  return [r * f, g * f, b * f, a];
}

// Three koi-believable colors, a fin tone (slightly darker base), and a
// noise-field offset, all driven by `rng`.
export function pickKoiColors(rng: () => number): KoiColors {
  const base = pick(rng, BASE_FAMILIES);
  return {
    base,
    mid: pick(rng, MID_FAMILIES),
    accent: pick(rng, ACCENT_FAMILIES),
    fin: darken(base, FIN_DARKEN),
    seed: [rng() * SEED_SCALE, rng() * SEED_SCALE],
  };
}
