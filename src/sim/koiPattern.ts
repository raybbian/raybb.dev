export type Rgba = [number, number, number, number];

export interface KoiColors {
  base: Rgba;
  mid: Rgba;
  accent: Rgba;
  fin: Rgba; // darker than base; flat fin color
  seed: [number, number];
}

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

// [hLo, hHi, sLo, sHi, lLo, lHi] per pigment family; jittered per fish.
const BASE_FAMILIES: [number, number, number, number, number, number][] = [
  [0.0, 0.0, 0.0, 0.06, 0.93, 1.0], // porcelain white
  [0.09, 0.13, 0.2, 0.35, 0.84, 0.92], // warm cream
];
// Hue bands are narrow and non-wrapping: a [0.99,0.03] span lerps the long
// way through cyan/green/purple (neon), so red sits near 0.0 instead.
const MID_FAMILIES: [number, number, number, number, number, number][] = [
  [0.04, 0.08, 0.8, 0.95, 0.5, 0.6], // persimmon orange
  [0.0, 0.02, 0.72, 0.9, 0.52, 0.62], // soft pinkish red
];
const ACCENT_FAMILIES: [number, number, number, number, number, number][] = [
  [0.0, 0.0, 0.0, 0.05, 0.05, 0.13], // sumi black
  [0.62, 0.68, 0.25, 0.45, 0.16, 0.26], // deep indigo
];

// Rare metallic Ogon body: warm gold instead of white/cream.
const GOLDEN_CHANCE = 0.12;
const GOLDEN_FAMILY: [number, number, number, number, number, number] = [
  0.11, 0.14, 0.78, 0.92, 0.52, 0.6,
];

const FIN_DARKEN = 0.82; // fin tone = base * this
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

function darken([r, g, b, a]: Rgba, f: number): Rgba {
  return [r * f, g * f, b * f, a];
}

export function pickKoiColors(rng: () => number): KoiColors {
  const base =
    rng() < GOLDEN_CHANCE
      ? pick(rng, [GOLDEN_FAMILY])
      : pick(rng, BASE_FAMILIES);
  return {
    base,
    mid: pick(rng, MID_FAMILIES),
    accent: pick(rng, ACCENT_FAMILIES),
    fin: darken(base, FIN_DARKEN),
    seed: [rng() * SEED_SCALE, rng() * SEED_SCALE],
  };
}
