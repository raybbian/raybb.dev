import { readFileSync } from "node:fs";
import path from "node:path";

// Server-only (build-time SSG). Strips the metadata export and code fences
// from the raw .mdx for a rough word count.
export function readingTimeMinutes(slug: string): number {
  const file = path.join(process.cwd(), "src/content/blog", `${slug}.mdx`);
  const raw = readFileSync(file, "utf8");
  const text = raw
    .replace(/export const metadata[\s\S]*?};/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`[\]()-]/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
