import type { ComponentType } from "react";
import HelloKoi, { metadata as helloKoi } from "./hello-koi/index.mdx";

export type PostMeta = {
  title: string;
  date: string;
  description: string;
};

export type PostEntry = {
  slug: string;
  meta: PostMeta;
  Component: ComponentType;
};

export const posts: PostEntry[] = [
  { slug: "hello-koi", meta: helloKoi as PostMeta, Component: HelloKoi },
].sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));

export const postSlugs = posts.map((p) => p.slug);

export function getPost(slug: string): PostEntry | undefined {
  return posts.find((p) => p.slug === slug);
}
