import Link from "next/link";
import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import Panel from "@/components/Panel";
import { posts } from "@/content/blog";
import { readingTimeMinutes } from "@/content/blog/readingTime";

const blogDescription =
  "Writing on anything I find interesting enough to share.";
const blogThumb = `/thumbnails/${posts[0].slug}.png`;

export const metadata: Metadata = {
  title: "Blog",
  description: blogDescription,
  openGraph: {
    type: "website",
    title: "Blog",
    description: blogDescription,
    url: "/blog",
    images: [{ url: blogThumb, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog",
    description: blogDescription,
    images: [blogThumb],
  },
};

export default function BlogIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-28">
      <SectionHeading lead="Read my" title="Blog." />
      <div className="flex flex-col gap-5">
        {posts.map(({ slug, meta, Thumb }) => (
          <Link key={slug} href={`/blog/${slug}`} className="group">
            <Panel className="flex flex-row overflow-hidden transition-colors group-hover:bg-black/50">
              <div className="relative w-32 shrink-0 overflow-hidden border-r border-white/10 bg-gradient-to-br from-white/10 to-transparent sm:w-40">
                {Thumb && <Thumb />}
              </div>
              <div className="min-w-0 flex-1 p-6">
                <p className="ink-3 text-sm">
                  {meta.date} · {readingTimeMinutes(slug)} min read
                </p>
                <h2 className="ink mt-1 text-xl font-semibold sm:text-2xl">
                  {meta.title}
                </h2>
                <p className="ink-2 mt-2">{meta.description}</p>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </main>
  );
}
