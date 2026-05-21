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
  const ogImage = "/og.png";
  const url = `/blog/${slug}`;
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      type: "article",
      title: meta.title,
      description: meta.description,
      url,
      publishedTime: meta.date,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [ogImage],
    },
  };
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

  const postingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    author: { "@type": "Person", name: "Raymond Bian" },
    image: `/thumbnails/${slug}.png`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `/blog/${slug}` },
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-0 py-20 sm:px-6 sm:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(postingJsonLd) }}
      />
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
