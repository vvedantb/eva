import type { ExtraProps } from "streamdown";

type HastElement = NonNullable<ExtraProps["node"]>;
type HastChild = HastElement["children"][number];

export interface FencedCode {
  code: string;
  /** Fence language as written (`ts`, `bash`), or "" for a bare fence. */
  language: string;
  /** File name from the fence meta (`title="a.ts"`, `file=a.ts`, `a.ts`). */
  title: string | null;
}

const LANGUAGE_CLASS = /^language-(.+)$/;
const TITLE_ATTRIBUTE = /(?:^|\s)(?:title|file|filename)=(?:"([^"]+)"|'([^']+)'|(\S+))/;
/** A bare meta token that names a file: has a dot or slash, no `=` or braces. */
const BARE_FILE = /^[\w@~./\\-]*[./\\][\w@~./\\-]+$/;

function textOf(node: HastChild): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  return node.children.map(textOf).join("");
}

/** The file name a fence meta string points at, if any. */
export function parseFenceTitle(meta: string): string | null {
  const attribute = TITLE_ATTRIBUTE.exec(meta);
  if (attribute) return attribute[1] ?? attribute[2] ?? attribute[3] ?? null;
  const bare = meta.trim().split(/\s+/)[0] ?? "";
  return BARE_FILE.test(bare) && !/^\d/.test(bare) ? bare : null;
}

/**
 * Reads a fenced code block off the hast `pre` react-markdown hands its
 * renderer. Parsing the tree rather than the rendered `code` child keeps this
 * typed: the child is an opaque element whose props TypeScript cannot see.
 */
export function readFencedCode(pre: HastElement): FencedCode | null {
  for (const child of pre.children) {
    if (child.type !== "element" || child.tagName !== "code") continue;
    const classes = child.properties.className;
    let language = "";
    if (Array.isArray(classes)) {
      for (const name of classes) {
        const match = LANGUAGE_CLASS.exec(String(name));
        if (match?.[1]) language = match[1];
      }
    }
    const meta = child.properties.metastring;
    return {
      code: textOf(child),
      language,
      title: typeof meta === "string" ? parseFenceTitle(meta) : null,
    };
  }
  return null;
}
