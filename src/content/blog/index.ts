import { metadata as helloKoi } from "./hello-koi.mdx";

export type PostMeta = {
  title: string;
  date: string;
  description: string;
};

export type PostEntry = {
  slug: string;
  meta: PostMeta;
};

// Explicit registry — avoids fs/glob, which is unavailable under Turbopack.
export const posts: PostEntry[] = [
  { slug: "hello-koi", meta: helloKoi as PostMeta },
].sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));

export const postSlugs = posts.map((p) => p.slug);
