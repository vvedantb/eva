import type { ComponentProps } from "react";
import { Children } from "react";
import { IconFile } from "@tabler/icons-react";
import type { ExtraProps } from "streamdown";

/**
 * Inline code that names a file, optionally with a `:line[:col]` suffix. A
 * path with a directory (`src/a.ts`, `./x/y.md`, `~/z.json`) may end in any
 * extension; a bare name must end in a common source extension, because
 * `console.log` and `ctx.db` are code, not files.
 */
const PATH_WITH_DIRECTORY =
  /^(?:~|\.{1,2})?\/?(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*\.[a-z][a-z0-9]{0,7}(?::\d+(?::\d+)?)?$/i;
const BARE_FILE_NAME =
  /^[\w@+-][\w@.+-]*\.(?:[cm]?[jt]sx?|json|jsonc|mdx?|css|scss|html|ya?ml|toml|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|sql|txt|lock|xml|svg|vue|svelte|astro|prisma|graphql|csv|ipynb|env)(?::\d+(?::\d+)?)?$/;

export function looksLikeFilePath(text: string): boolean {
  if (text.includes("://")) return false;
  return text.includes("/")
    ? PATH_WITH_DIRECTORY.test(text)
    : BARE_FILE_NAME.test(text);
}

/**
 * Inline `code` renderer. A span that names a file gets a file icon so paths
 * read as paths at a glance; everything else is ordinary inline code.
 */
export function MarkdownInlineCode({ children }: ComponentProps<"code"> & ExtraProps) {
  const parts = Children.toArray(children);
  const text = parts.length === 1 && typeof parts[0] === "string" ? parts[0] : null;
  if (text === null || !looksLikeFilePath(text)) {
    return <code className="markdown-inline-code">{children}</code>;
  }
  return (
    <code className="markdown-inline-code" data-file title={text}>
      <IconFile aria-hidden />
      {text}
    </code>
  );
}
