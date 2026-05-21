"use client";

import {
  makeFiguresProvider,
  type FigureRegistry,
} from "@/figures/registryContext";

// Each entry is a dynamic import so a figure's code (and its WebGL/2D logic)
// is only fetched when a <Figure> with that id scrolls near the viewport.
export const figures: FigureRegistry = {
  "fish-circles": () => import("./fishCircles"),
  "catmull-rom": () => import("./catmullRom"),
  "ear-clip": () => import("./earClip"),
  "fish-ribbon": () => import("./fishRibbon"),
  "fish-swim": () => import("./fishSwim"),
  "frag-color-modes": () => import("./fragColorModes"),
  "value-noise": () => import("./valueNoise"),
  "koi-steps": () => import("./koiSteps"),
  "koi-pattern": () => import("./koiPattern"),
  "uv-mapping": () => import("./uvMapping"),
  "lilypad-wires": () => import("./lilypadWires"),
  "lotus-petal-mix": () => import("./lotusPetalMix"),
  "lotus-single": () => import("./lotusSingle"),
  "displacement-noise": () => import("./displacementNoise"),
  "baked-noise": () => import("./bakedNoise"),
  "ripple-textures": () => import("./rippleTextures"),
  "fish-behavior": () => import("./fishBehavior"),
  "flat-vs-toon": () => import("./flatVsToon"),
  "water-refract": () => import("./waterRefract"),
  "shadows-on-off": () => import("./shadowsOnOff"),
  "heightmap-diagram": () => import("./heightmapDiagram"),
};

export type FigureId = keyof typeof figures;

// Bound to this post's map here, in a client module, so the MDX only ever
// passes `children` across the RSC boundary — never the function map.
export const FiguresProvider = makeFiguresProvider(figures);
