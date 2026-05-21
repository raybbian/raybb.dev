import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Panel from "@/components/Panel";
import BlogToc from "@/components/BlogToc";
import { getPost, postSlugs } from "@/content/blog";
import { readingTimeMinutes } from "@/content/blog/readingTime";

export const dynamicParams = false;

export function generateStaticParams() {
  return postSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = getPost(slug)?.meta;
  if (!meta) return {};
  return { title: `${meta.title} — Raymond Bian`, description: meta.description };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const { Component: Post, meta } = post;

  return (
    <main className="mx-auto w-full max-w-3xl px-0 py-20 sm:px-6 sm:py-28">
      <div className="px-5 sm:px-0">
        <Link
          href="/blog"
          className="accent text-sm transition-opacity hover:opacity-70"
        >
          ← All posts
        </Link>
        <p className="ink-3 mt-6 text-sm">
          {meta.date} · {readingTimeMinutes(slug)} min read
        </p>
      </div>
      <Panel
        className="mt-3 rounded-none px-5 py-8 sm:rounded-2xl sm:px-10 sm:py-10"
        data-blog-content
      >
        <Post />
      </Panel>
      <BlogToc />
    </main>
  );
}
