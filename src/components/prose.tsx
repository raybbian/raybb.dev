import { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

// Shared typography primitives. Used directly in page sections and mapped
// from markdown elements in mdx-components.tsx so blog and site stay consistent.

export function H1({ children, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className="mt-2 mb-6 text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl"
      {...p}
    >
      {children}
    </h1>
  );
}

export function H2({ children, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className="mt-10 mb-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
      {...p}
    >
      {children}
    </h2>
  );
}

export function H3({ children, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className="mt-8 mb-3 text-xl font-semibold text-white" {...p}>
      {children}
    </h3>
  );
}

export function P({ children, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className="my-4 text-lg leading-relaxed text-white/80" {...p}>
      {children}
    </p>
  );
}

export function Ul({ children, ...p }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className="my-4 list-disc space-y-2 pl-6 text-lg text-white/80"
      {...p}
    >
      {children}
    </ul>
  );
}

export function Ol({ children, ...p }: HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className="my-4 list-decimal space-y-2 pl-6 text-lg text-white/80"
      {...p}
    >
      {children}
    </ol>
  );
}

export function Li({ children, ...p }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li className="leading-relaxed" {...p}>
      {children}
    </li>
  );
}

export function Quote({ children, ...p }: HTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote
      className="my-6 border-l-4 border-emerald-300/60 bg-white/5 py-2 pl-5 text-lg italic text-white/75"
      {...p}
    >
      {children}
    </blockquote>
  );
}

export function A({
  children,
  ...p
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = p.href?.startsWith("http");
  return (
    <a
      className="font-medium text-emerald-200 underline decoration-emerald-200/40 underline-offset-4 transition-colors hover:text-emerald-100"
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...p}
    >
      {children}
    </a>
  );
}

export function Code({ children, ...p }: HTMLAttributes<HTMLElement>) {
  return (
    <code
      className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-emerald-100"
      {...p}
    >
      {children}
    </code>
  );
}

export function Pre({ children, ...p }: HTMLAttributes<HTMLPreElement>) {
  return (
    <pre
      className="my-6 overflow-x-auto rounded-xl border border-white/25 bg-black/40 p-4 text-sm leading-relaxed text-white/90 backdrop-blur-sm dark:border-white/10 dark:bg-black/50"
      {...p}
    >
      {children}
    </pre>
  );
}

export function Hr() {
  return <hr className="my-10 border-white/15" />;
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-koi">{children}</div>;
}
