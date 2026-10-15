"use client";

import type { ComponentProps } from "react";
import { memo } from "react";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { Components } from "streamdown";
import {
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
} from "streamdown";

import { cn } from "../utils/cn";
import { parseMarkdownIntoBlocksIncremental } from "./incrementalBlocks";
import { MarkdownBlockquote } from "./MarkdownBlockquote";
import { MarkdownPre } from "./MarkdownCodeBlock";
import { MarkdownInlineCode } from "./MarkdownInlineCode";
import { MarkdownLink } from "./MarkdownLink";
import { copyMarkdownSelection } from "./markdownClipboard";
import { rehypeGithubAlerts } from "./rehypeGithubAlerts";
// The math plugin renders KaTeX markup but ships no stylesheet with it.
import "katex/dist/katex.min.css";

const PLUGINS = { cjk, code, math, mermaid };

/**
 * `remarkPlugins` / `rehypePlugins` REPLACE Streamdown's defaults rather than
 * extending them, so the defaults (GFM + fence meta; raw HTML, sanitise,
 * harden) are spread back in first. Alerts run after the sanitiser, which
 * would otherwise strip the attribute they set.
 */
const REMARK_PLUGINS = Object.values(defaultRemarkPlugins);
const REHYPE_PLUGINS = [...Object.values(defaultRehypePlugins), rehypeGithubAlerts];

/**
 * Plain tags where Streamdown's defaults bake in Tailwind classes (text-3xl
 * headings, `list-inside` lists, a `span` for bold, padded table cells): the
 * `.markdown` stylesheet owns typography, so these render unstyled. `table`
 * itself stays Streamdown's, for its copy / download / fullscreen controls.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  ul: "ul",
  ol: "ol",
  li: "li",
  hr: "hr",
  strong: "strong",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
  a: MarkdownLink,
  blockquote: MarkdownBlockquote,
  pre: MarkdownPre,
  inlineCode: MarkdownInlineCode,
};

export type MarkdownProps = Omit<
  ComponentProps<typeof Streamdown>,
  "plugins" | "rehypePlugins" | "parseMarkdownIntoBlocksFn"
> & {
  children: string;
};

/**
 * The one markdown renderer: chat replies, reasoning, comments, PR bodies,
 * changelogs. Streamdown streams it block by block; this layer adds the code
 * blocks, callouts, links, typography and copy-as-markdown every surface
 * shares. `components` and `remarkPlugins` extend the defaults, never replace
 * them (mention chips, line breaks).
 */
export const Markdown = memo(function Markdown({
  className,
  components,
  remarkPlugins,
  children,
  ...props
}: MarkdownProps) {
  return (
    <div className="contents" onCopy={copyMarkdownSelection}>
      <Streamdown
        className={cn("markdown", className)}
        plugins={PLUGINS}
        components={
          components ? { ...MARKDOWN_COMPONENTS, ...components } : MARKDOWN_COMPONENTS
        }
        remarkPlugins={
          remarkPlugins ? [...REMARK_PLUGINS, ...remarkPlugins] : REMARK_PLUGINS
        }
        rehypePlugins={REHYPE_PLUGINS}
        // Streamdown re-renders only the block still being written, but its
        // default split re-lexes the whole reply behind every token. This one
        // reuses the blocks a byte-identical prefix already produced.
        parseMarkdownIntoBlocksFn={parseMarkdownIntoBlocksIncremental}
        {...props}
      >
        {children}
      </Streamdown>
    </div>
  );
});
