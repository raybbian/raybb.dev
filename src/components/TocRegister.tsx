"use client";

import { useTocScope, type TocEntry } from "./TocProvider";

// H2/H3 are server components and can't read context directly. They drop
// this null-rendering client child in so the entry registers during render.
export default function TocRegister(entry: TocEntry) {
  useTocScope()?.register(entry);
  return null;
}
