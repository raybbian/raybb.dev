// Number <Footnote> JSX nodes in document order at MDX-compile time and
// inject `n={N}` as a prop. Numbering at runtime is unsafe under React 19
// streaming SSR: async server components (e.g. <CodeSnippet> awaiting shiki)
// cause sibling client subtrees to be retried, fresh fibers reset useRef,
// and a closure counter ends up advancing more on the server than the client.

function visit(node, callback) {
  if (!node) return;
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    callback(node);
  }
  if (node.children) {
    for (const child of node.children) visit(child, callback);
  }
}

export default function remarkNumberFootnotes() {
  return (tree) => {
    let n = 0;
    visit(tree, (node) => {
      if (node.name !== "Footnote") return;
      const attrs = node.attributes ?? (node.attributes = []);
      // Author-provided n wins — lets a post override numbering if needed.
      if (attrs.some((a) => a.type === "mdxJsxAttribute" && a.name === "n")) {
        return;
      }
      n += 1;
      // mdxJsxAttributeValueExpression needs a parsed estree alongside the
      // raw source — without it, the MDX→JSX emitter produces `n: ,` (an
      // empty expression slot) and the file fails to parse.
      const raw = String(n);
      attrs.push({
        type: "mdxJsxAttribute",
        name: "n",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: raw,
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: { type: "Literal", value: n, raw },
                },
              ],
            },
          },
        },
      });
    });
  };
}
