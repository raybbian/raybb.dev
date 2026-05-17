import type { MDXComponents } from "mdx/types";
import {
  H1,
  H2,
  H3,
  P,
  Ul,
  Ol,
  Li,
  Quote,
  A,
  Code,
  Pre,
  Hr,
} from "@/components/prose";

const components: MDXComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  p: P,
  ul: Ul,
  ol: Ol,
  li: Li,
  blockquote: Quote,
  a: A,
  code: Code,
  pre: Pre,
  hr: Hr,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
