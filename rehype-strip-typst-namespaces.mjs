// Strip XML namespace prefixes (e.g. `h5:`) from hast element tag names
// emitted by @myriaddreamin/rehype-typst. Typst inlines its text-selection
// layer inside <foreignObject> as <h5:div class="tsel">…; React's HTML
// renderer doesn't understand the namespace and logs a console error per
// element. Rewriting `<h5:div>` to `<div>` keeps the selectable text layer
// while making the tags valid HTML.

function visit(node, callback) {
  if (!node) return;
  if (node.type === "element") callback(node);
  if (node.children) {
    for (const child of node.children) visit(child, callback);
  }
}

export default function rehypeStripTypstNamespaces() {
  return (tree) => {
    visit(tree, (node) => {
      if (typeof node.tagName === "string" && node.tagName.includes(":")) {
        node.tagName = node.tagName.split(":").pop();
      }
    });
  };
}
