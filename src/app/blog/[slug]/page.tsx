import type { Metadata } from "next";
import Link from "next/link";
import Panel from "@/components/Panel";
import { postSlugs } from "@/content/blog";
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
  const { metadata } = await import(`@/content/blog/${slug}.mdx`);
  return { title: `${metadata.title} — Raymond Bian`, description: metadata.description };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { default: Post, metadata } = await import(
    `@/content/blog/${slug}.mdx`
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-28">
      <Link
        href="/"
        className="frost fixed left-5 top-5 z-50 rounded-full px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/30 hover:text-white dark:text-white/80 dark:hover:bg-black/50"
      >
        ← Home
      </Link>
      <Link
        href="/blog"
        className="text-sm text-emerald-200 transition-colors hover:text-emerald-100"
      >
        ← All posts
      </Link>
      <p className="mt-6 text-sm text-white/50">
        {metadata.date} · {readingTimeMinutes(slug)} min read
      </p>
      <Panel className="mt-3 px-7 py-8 sm:px-10 sm:py-10">
        <Post />
      </Panel>
    </main>
  );
}
