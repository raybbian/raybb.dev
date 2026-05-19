"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FigureModule } from "./types";

// A post's figure registry: figure id -> lazy import of its sketch module.
export type FigureRegistry = Record<
  string,
  () => Promise<{ default: FigureModule }>
>;

const Ctx = createContext<FigureRegistry | null>(null);

export function useFigureRegistry(): FigureRegistry {
  const r = useContext(Ctx);
  if (!r)
    throw new Error("<Figure> must be rendered inside a post's FiguresProvider");
  return r;
}

// Each post's registry.ts calls this with its own map and exports the result,
// so the function-valued registry is captured by a client module rather than
// passed as a prop across the RSC boundary (which forbids functions).
export function makeFiguresProvider(registry: FigureRegistry) {
  return function FiguresProvider({ children }: { children: ReactNode }) {
    return <Ctx.Provider value={registry}>{children}</Ctx.Provider>;
  };
}
