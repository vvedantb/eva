"use client";

import type { ComponentProps, ReactNode } from "react";
import { Fragment, cloneElement, isValidElement, useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconFileCode,
  IconTextWrap,
} from "@tabler/icons-react";
import type { ExtraProps } from "streamdown";
import { useIsCodeFenceIncomplete } from "streamdown";

import { MessageAction } from "../ai-elements/message";
import type { FencedCode } from "./codeFence";
import { readFencedCode } from "./codeFence";
import type { CodeLine, HighlightToken } from "./codeHighlight";
import { useHighlightedLines } from "./codeHighlight";
import { useMermaidRender } from "./mermaid";
const COPIED_MS = 1200;

/**
 * Token colours travel as custom properties so one render serves both
 * themes: `--md-c` is the light colour, `--shiki-dark` the dark one, and the
 * stylesheet picks between them.
 */
function tokenStyle(token: HighlightToken): Record<string, string> {
  const style: Record<string, string> = {};
  if (token.color) style["--md-c"] = token.color;
  for (const [name, value] of Object.entries(token.htmlStyle ?? {})) {
    style[name === "color" ? "--md-c" : name] = value;
  }
  return style;
}

function CodeLineView({ line, newline }: { line: CodeLine; newline: boolean }) {
  return (
    <span className="markdown-code-line">
      {line.tokens === null
        ? line.text
        : line.tokens.map((token, index) => (
            <span key={index} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))}
      {newline ? "\n" : null}
    </span>
  );
}

function MarkdownCodeBlock({
  code,
  language,
  title,
}: {
  code: string;
  language: string;
  title: string | null;
}) {
  const isIncomplete = useIsCodeFenceIncomplete();
  const lines = useHighlightedLines(code, language, isIncomplete);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  return (
    <div
      className="markdown-code"
      data-language={language || undefined}
      data-wrap={wrap || undefined}
    >
      <div className="markdown-code-header" data-markdown-copy="skip">
        <span className="markdown-code-label">
          {title ? (
            <>
              <IconFileCode aria-hidden />
              <span className="truncate">{title}</span>
            </>
          ) : (
            (language || "text").toLowerCase()
          )}
        </span>
        <span className="markdown-code-actions">
          <MessageAction
            tooltip={wrap ? "Scroll long lines" : "Wrap long lines"}
            size="icon-xs"
            aria-pressed={wrap}
            className={wrap ? "text-foreground" : "text-muted-foreground"}
            onClick={() => setWrap(!wrap)}
          >
            <IconTextWrap />
          </MessageAction>
          <MessageAction
            tooltip={copied ? "Copied" : "Copy code"}
            size="icon-xs"
            className="text-muted-foreground"
            onClick={copy}
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </MessageAction>
        </span>
      </div>
      <pre>
        <code>
          {lines.map((line, index) => (
            <CodeLineView
              key={index}
              line={line}
              newline={index < lines.length - 1}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}

/**
 * A mermaid fence: the plain code block until the diagram has rendered, then
 * Streamdown's diagram view (pan, zoom, fullscreen, download). A fence still
 * streaming, or one that will not parse, stays code — no error box.
 */
function MarkdownMermaid({
  fenced,
  diagram,
}: {
  fenced: FencedCode;
  diagram: ReactNode;
}) {
  const isIncomplete = useIsCodeFenceIncomplete();
  const { theme, status } = useMermaidRender(fenced.code, !isIncomplete);
  if (status === "done") {
    // Streamdown renders once per mount, so a theme change remounts it.
    return <Fragment key={theme}>{diagram}</Fragment>;
  }
  return (
    <MarkdownCodeBlock
      code={fenced.code}
      language={fenced.language}
      title={fenced.title}
    />
  );
}

/**
 * `pre` renderer: fenced code becomes our code block (header with file name or
 * language, wrap toggle, copy). Mermaid fences become diagrams once they
 * render, through Streamdown's own `code` renderer, which is what its default
 * `pre` does too.
 */
export function MarkdownPre({ children, node }: ComponentProps<"pre"> & ExtraProps) {
  const fenced = node ? readFencedCode(node) : null;
  const passthrough = isValidElement<{ "data-block"?: string }>(children)
    ? cloneElement(children, { "data-block": "true" })
    : <pre>{children}</pre>;
  if (fenced === null) return passthrough;
  if (fenced.language.toLowerCase() === "mermaid") {
    return <MarkdownMermaid fenced={fenced} diagram={passthrough} />;
  }
  return (
    <MarkdownCodeBlock
      code={fenced.code}
      language={fenced.language}
      title={fenced.title}
    />
  );
}
