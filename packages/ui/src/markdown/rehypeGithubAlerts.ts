/**
 * GitHub alerts: a blockquote whose first line is exactly `[!NOTE]`, `[!TIP]`,
 * `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` renders as a callout.
 *
 * This runs on hast, after Streamdown's sanitiser: a remark-stage marker
 * would be an attribute the sanitiser strips. It strips the marker line and
 * tags the blockquote with `data-alert`, which `MarkdownBlockquote` reads.
 * As on GitHub, `> [!NOTE] text` (marker not alone on its line) stays a quote.
 */

export const ALERT_KINDS = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, string | number | boolean | null | undefined | (string | number)[]>;
  children?: HastNode[];
}

const MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*(\r?\n|$)/i;

export function isAlertKind(value: string): value is AlertKind {
  return ALERT_KINDS.some((kind) => kind === value);
}

function isElement(node: HastNode | undefined, tagName: string): boolean {
  return node?.type === "element" && node.tagName === tagName;
}

function isBlank(node: HastNode): boolean {
  return node.type === "text" && (node.value ?? "").trim() === "";
}

/** Tags `blockquote` as an alert and strips its marker, if it has one. */
function convert(blockquote: HastNode): void {
  const paragraph = blockquote.children?.find((child) => !isBlank(child));
  if (!paragraph || !isElement(paragraph, "p") || !paragraph.children) return;
  const [first, second] = paragraph.children;
  if (first?.type !== "text") return;
  const match = MARKER.exec(first.value ?? "");
  const kind = match?.[1]?.toLowerCase();
  if (!match || kind === undefined || !isAlertKind(kind)) return;

  const endsLine = match[2] !== "";
  const rest = (first.value ?? "").slice(match[0].length);
  if (!endsLine) {
    // Marker ran to the end of the text node: the line ends only if a hard
    // break (remark-breaks) or nothing follows it.
    if (second !== undefined && !isElement(second, "br")) return;
    paragraph.children.splice(1, second === undefined ? 0 : 1);
    const next = paragraph.children[1];
    if (next?.type === "text") next.value = (next.value ?? "").replace(/^\r?\n/, "");
  }

  if (rest === "") paragraph.children.shift();
  else first.value = rest;
  if (paragraph.children.every(isBlank)) {
    blockquote.children = blockquote.children?.filter((child) => child !== paragraph);
  }
  blockquote.properties = { ...blockquote.properties, dataAlert: kind };
}

function visit(node: HastNode): void {
  for (const child of node.children ?? []) {
    if (isElement(child, "blockquote")) convert(child);
    visit(child);
  }
}

export function rehypeGithubAlerts() {
  return (tree: HastNode): void => visit(tree);
}
