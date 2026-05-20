import Link from "next/link";
import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import Panel from "@/components/Panel";
import { posts } from "@/content/blog";
import { readingTimeMinutes } from "@/content/blog/readingTime";

export const metadata: Metadata = {
  title: "Blog — Raymond Bian",
  description: "Writing on projects, algorithms, and graphics.",
};

export default function BlogIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-28">
      <SectionHeading lead="Read my" title="Blog." />
      <div className="flex flex-col gap-5">
        {posts.map(({ slug, meta }) => (
          <Link key={slug} href={`/blog/${slug}`} className="group">
            <Panel className="p-6 transition-colors group-hover:bg-black/50">
              <p className="ink-3 text-sm">
                {meta.date} · {readingTimeMinutes(slug)} min read
              </p>
              <h2 className="ink mt-1 text-xl font-semibold sm:text-2xl">
                {meta.title}
              </h2>
              <p className="ink-2 mt-2">{meta.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </main>
  );
}
