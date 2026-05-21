import type { MetadataRoute } from "next";
import { posts } from "@/content/blog";

const SITE_URL = "https://raybb.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
  const postRoutes: MetadataRoute.Sitemap = posts.map(({ slug, meta }) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: new Date(meta.date),
    changeFrequency: "yearly",
    priority: 0.7,
  }));
  return [...staticRoutes, ...postRoutes];
}
