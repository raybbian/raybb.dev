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
        {posts.map(({ slug, meta, Thumb }) => (
          <Link key={slug} href={`/blog/${slug}`} className="group">
            <Panel className="flex flex-row items-start overflow-hidden transition-colors group-hover:bg-black/50">
              <div className="relative aspect-square w-32 shrink-0 self-start overflow-hidden border-r border-white/10 bg-gradient-to-br from-white/10 to-transparent sm:w-40">
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
