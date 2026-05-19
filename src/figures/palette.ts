// Single source of truth for figure colors. Intentionally theme-independent
// for now — figures look identical in light and dark mode. (If per-theme
// figures are ever wanted, branch here, not in individual sketches.)
export const PALETTE = {
  // Canvas backdrop — CSS string for 2D, rgba tuple for WebGL clearColor.
  bg: "rgba(0,0,0,0.28)",
  bgGL: [0, 0, 0, 0.28] as [number, number, number, number],

  spine: "rgba(148,163,184,0.5)",
  structural: "rgba(148,163,184,0.45)", // raw polygons / circles
  divider: "rgba(148,163,184,0.2)",
  point: "rgba(226,232,240,0.95)",
  accent: "#2dd4bf", // curves / contour / active
  hint: "rgba(148,163,184,0.6)",

  font: "12px ui-sans-serif, system-ui, sans-serif",

  fillGL: [0.18, 0.83, 0.75, 0.22] as [number, number, number, number],
  wireGL: [0.7, 0.78, 0.85, 0.85] as [number, number, number, number],
};
