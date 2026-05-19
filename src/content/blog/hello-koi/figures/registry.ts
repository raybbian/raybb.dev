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
  "fish-ribbon": () => import("./fishRibbon"),
};

export type FigureId = keyof typeof figures;

// Bound to this post's map here, in a client module, so the MDX only ever
// passes `children` across the RSC boundary — never the function map.
export const FiguresProvider = makeFiguresProvider(figures);
