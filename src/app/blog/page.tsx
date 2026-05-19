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
      <Link
        href="/"
        className="frost fixed left-5 top-5 z-50 rounded-full px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/30 hover:text-white dark:text-white/80 dark:hover:bg-black/50"
      >
        ← Home
      </Link>
      <SectionHeading lead="Read my" title="Blog." />
      <div className="flex flex-col gap-5">
        {posts.map(({ slug, meta }) => (
          <Link key={slug} href={`/blog/${slug}`} className="group">
            <Panel className="p-6 transition-colors group-hover:bg-white/30 dark:group-hover:bg-black/50">
              <p className="text-sm text-white/50">
                {meta.date} · {readingTimeMinutes(slug)} min read
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                {meta.title}
              </h2>
              <p className="mt-2 text-white/70">{meta.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </main>
  );
}
