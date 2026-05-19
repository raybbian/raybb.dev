import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Panel from "@/components/Panel";
import { FootnotesProvider } from "@/components/FootnotesProvider";
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
    <main className="mx-auto w-full max-w-3xl px-6 py-28">
      <Link
        href="/"
        className="frost ink-2 fixed left-5 top-5 z-50 rounded-full px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/50"
      >
        ← Home
      </Link>
      <Link
        href="/blog"
        className="accent text-sm transition-opacity hover:opacity-70"
      >
        ← All posts
      </Link>
      <p className="ink-3 mt-6 text-sm">
        {meta.date} · {readingTimeMinutes(slug)} min read
      </p>
      <Panel className="mt-3 px-7 py-8 sm:px-10 sm:py-10">
        <FootnotesProvider>
          <Post />
        </FootnotesProvider>
      </Panel>
    </main>
  );
}
