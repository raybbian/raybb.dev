import { codeToHtml } from "shiki";
import { CodeSnippetClient } from "./CodeSnippetClient";

type Props = {
  code: string;
  lang: string;
  name?: string;
  collapsedHeight?: number;
};

// Server component: runs shiki at build time and hands the highlighted HTML
// to a small client wrapper that handles click-to-expand.
export default async function CodeSnippet({
  code,
  lang,
  name,
  collapsedHeight = 360,
}: Props) {
  const html = await codeToHtml(code.trimEnd(), {
    lang,
    theme: "github-dark",
  });
  return (
    <CodeSnippetClient
      html={html}
      name={name}
      lang={lang}
      collapsedHeight={collapsedHeight}
    />
  );
}
