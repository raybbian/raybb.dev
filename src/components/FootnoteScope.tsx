import { Children, isValidElement, type ReactNode } from "react";
import { Footnote } from "./Footnote";

// Walk children synchronously for inline <Footnote> markers and render their
// bodies in a small list directly beneath. No context, no render-time
// mutation — the previous "register during child render, read during sibling
// render" pattern was unsafe under React 19 streaming SSR. Async server
// components elsewhere in the tree (e.g. <CodeSnippet> awaiting shiki)
// caused sibling client subtrees to be retried; the committed collector
// could end up empty on one side of the SSR/CSR boundary, leaving stray
// list entries missing in the server HTML.

type FootnoteEntry = { n: number; content: ReactNode };

function collect(node: ReactNode, out: FootnoteEntry[]): void {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { n?: number; children?: ReactNode };
    if (child.type === Footnote) {
      if (typeof props.n === "number") {
        out.push({ n: props.n, content: props.children });
      }
      return;
    }
    if (props.children !== undefined) collect(props.children, out);
  });
}

export function FootnoteScope({ children }: { children: ReactNode }) {
  const entries: FootnoteEntry[] = [];
  collect(children, entries);
  return (
    <>
      {children}
      {entries.length > 0 && <FootnoteList entries={entries} />}
    </>
  );
}

function FootnoteList({ entries }: { entries: FootnoteEntry[] }) {
  return (
    <div className="ink-3 mt-2 mb-4 space-y-1 border-l-2 border-white/10 pl-4 text-sm">
      {entries.map(({ n, content }) => (
        <p key={n} id={`fn-${n}`} className="leading-relaxed">
          <a
            href={`#fnref-${n}`}
            className="accent mr-1.5 font-medium no-underline"
          >
            {n}.
          </a>
          {content}
        </p>
      ))}
    </div>
  );
}
