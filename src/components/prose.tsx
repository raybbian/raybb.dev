import { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { FootnoteScope } from "./FootnoteScope";
import HeadingAnchor from "./HeadingAnchor";

// Shared typography primitives. Used directly in page sections and mapped
// from markdown elements in mdx-components.tsx so blog and site stay consistent.

export function H1({ children, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className="ink mt-2 mb-6 text-4xl font-bold tracking-tight sm:text-5xl"
      {...p}
    >
      {children}
    </h1>
  );
}

export function H2({ children, id, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      id={id}
      className="ink group mt-10 mb-4 text-2xl font-semibold tracking-tight sm:text-3xl"
      {...p}
    >
      {children}
      {id ? <HeadingAnchor id={id} /> : null}
    </h2>
  );
}

export function H3({ children, id, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 id={id} className="ink group mt-8 mb-3 text-xl font-semibold" {...p}>
      {children}
      {id ? <HeadingAnchor id={id} /> : null}
    </h3>
  );
}

export function P({ children, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <FootnoteScope>
      <p className="ink-2 my-4 text-lg leading-relaxed" {...p}>
        {children}
      </p>
    </FootnoteScope>
  );
}

export function Ul({ children, ...p }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className="ink-2 my-4 list-disc space-y-2 pl-6 text-lg"
      {...p}
    >
      {children}
    </ul>
  );
}

export function Ol({ children, ...p }: HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className="ink-2 my-4 list-decimal space-y-2 pl-6 text-lg"
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
      className="ink-2 my-6 border-l-4 border-emerald-300/60 bg-white/5 py-2 pl-5 text-lg italic"
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
      className="accent font-medium underline decoration-1 underline-offset-4 transition-opacity hover:opacity-70"
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
      className="accent rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em]"
      {...p}
    >
      {children}
    </code>
  );
}

export function Pre({ children, ...p }: HTMLAttributes<HTMLPreElement>) {
  return (
    <pre
      className="ink-2 my-6 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-relaxed backdrop-blur-sm"
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
