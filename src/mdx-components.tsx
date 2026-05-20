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
import { Video } from "@/components/Video";
import { Figure } from "@/components/Figure";
import { ImageFigure } from "@/components/ImageFigure";
import { Footnote } from "@/components/Footnote";
import { Todo } from "@/components/Todo";

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
  Video,
  Figure,
  ImageFigure,
  Footnote,
  Todo,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
