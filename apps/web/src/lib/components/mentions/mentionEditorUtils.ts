import { escapeHtml } from "@eva/shared/escapeHtml";
import { EDITOR_CHIP_CLICKABLE_CLASS } from "./mentionChipStyles";
import { LINK_URL_SOURCE } from "./linkUrls";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds an alternation regex that matches `@<label>` for each known label.
 * Sorted longest-first so longer labels win when one is a prefix of another.
 */
export function buildMentionPattern(labels: string[]): RegExp {
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  return new RegExp(`@(?:${sorted.map(escapeRegex).join("|")})`, "g");
}

/** Builds an alternation regex that matches `/<label>` for each known skill label. */
export function buildSkillPattern(labels: string[]): RegExp {
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  return new RegExp(`\\/(?:${sorted.map(escapeRegex).join("|")})`, "g");
}

interface EditorChipSegment {
  type: "text" | "mention" | "skill" | "link";
  value: string;
}

/**
 * Link source is listed first so a full URL is consumed as one match before an
 * `@`/`/` label alternative could match a fragment inside it (e.g. the `/design`
 * segment of a Figma URL). Always includes the link source, so it is never null.
 */
function buildEditorChipPattern(
  mentionLabels: string[],
  skillLabels: string[],
): RegExp {
  const parts: string[] = [LINK_URL_SOURCE];
  for (const label of [...mentionLabels].sort((a, b) => b.length - a.length)) {
    parts.push(`@${escapeRegex(label)}`);
  }
  for (const label of [...skillLabels].sort((a, b) => b.length - a.length)) {
    parts.push(`\\/${escapeRegex(label)}`);
  }
  return new RegExp(parts.join("|"), "g");
}

function editorChipTypeFor(token: string): EditorChipSegment["type"] {
  if (/^https?:\/\//.test(token)) return "link";
  return token.startsWith("/") ? "skill" : "mention";
}

function parseEditorChipSegments(
  value: string,
  mentionLabels: Iterable<string>,
  skillLabels: Iterable<string>,
): EditorChipSegment[] {
  const pattern = buildEditorChipPattern([...mentionLabels], [...skillLabels]);

  const segments: EditorChipSegment[] = [];
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) continue;
    if (start > lastIndex) {
      segments.push({ type: "text", value: value.slice(lastIndex, start) });
    }
    const token = match[0];
    segments.push({ type: editorChipTypeFor(token), value: token });
    lastIndex = start + token.length;
  }
  if (lastIndex < value.length) {
    segments.push({ type: "text", value: value.slice(lastIndex) });
  }
  return segments;
}

function chipLabelFromToken(token: string): string {
  return token.startsWith("@") || token.startsWith("/")
    ? token.slice(1)
    : token;
}

function renderEditorChipSpan(
  segment: EditorChipSegment,
  chipClassName: string,
  label: string,
  hasResolvableId: boolean,
  clickable: boolean,
  dataKind: "mention" | "skill",
): string {
  const isClickable = clickable && hasResolvableId;
  const className = isClickable
    ? `${chipClassName} ${EDITOR_CHIP_CLICKABLE_CLASS}`
    : chipClassName;
  const labelAttr =
    dataKind === "mention" ? "data-mention-label" : "data-skill-label";
  return `​<span data-${dataKind}="true" ${labelAttr}="${escapeHtml(label)}" contenteditable="false" class="${escapeHtml(className)}">${escapeHtml(segment.value)}</span>​`;
}

/** Tabler `brand-github` (what chat's `MarkdownLink` shows for GitHub). */
const GITHUB_ICON_HTML =
  '<svg class="markdown-link-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"/></svg>';

/**
 * Same look as chat's `MarkdownLink` (`markdown-link` underline + the host's
 * own favicon, GitHub glyph for github.com), as markup: the composer renders
 * via `innerHTML`, so there is no React tree. A favicon that fails to load is
 * hidden by `MentionEditor`'s `onErrorCapture`. `<wbr>` after separators lets
 * a long URL wrap where a reader expects.
 */
function renderEditorLinkHtml(url: string): string {
  const host = URL.canParse(url) ? new URL(url).host : "";
  const icon =
    host.replace(/^www\./, "") === "github.com"
      ? GITHUB_ICON_HTML
      : `<img class="markdown-link-icon" src="https://${escapeHtml(host)}/favicon.ico" alt="" aria-hidden="true" loading="lazy" referrerpolicy="no-referrer">`;
  const label = url
    .split(/([/.?&=#_-]+)/)
    .map((part, index) =>
      index % 2 === 1 ? `${escapeHtml(part)}<wbr>` : escapeHtml(part),
    )
    .join("");
  return `​<span data-link-url="${escapeHtml(url)}" title="${escapeHtml(url)}" contenteditable="false" class="markdown-link cursor-pointer">${icon}${label}</span>​`;
}

export function renderEditorChipHtml(
  value: string,
  mentionLabelToId: ReadonlyMap<string, string>,
  skillLabelToId: ReadonlyMap<string, string>,
  mentionChipClassName: string,
  skillChipClassName: string,
  chipsClickable: boolean,
): string {
  const segments = parseEditorChipSegments(
    value,
    mentionLabelToId.keys(),
    skillLabelToId.keys(),
  );
  return segments
    .map((segment) => {
      if (segment.type === "link") return renderEditorLinkHtml(segment.value);
      if (segment.type === "mention") {
        const label = chipLabelFromToken(segment.value);
        return renderEditorChipSpan(
          segment,
          mentionChipClassName,
          label,
          mentionLabelToId.has(label),
          chipsClickable,
          "mention",
        );
      }
      if (segment.type === "skill") {
        const label = chipLabelFromToken(segment.value);
        return renderEditorChipSpan(
          segment,
          skillChipClassName,
          label,
          skillLabelToId.has(label),
          chipsClickable,
          "skill",
        );
      }
      return escapeHtml(segment.value).replace(/\n/g, "<br>");
    })
    .join("");
}

/** Where the last accepted picker item put its chip, and what it inserted. */
export interface InsertedToken {
  startIndex: number;
  /** The visible token, e.g. `/caveman-help` or `@Design doc`. */
  token: string;
}

/**
 * True when the trigger just found is nothing but the chip the last accept
 * inserted, still intact.
 *
 * A chip's own text is indistinguishable from an in-progress trigger — `/label`
 * with no whitespace after it — so whenever the trailing space that accepting
 * inserts goes missing, the picker reopens filtering by the chip's own label.
 * The space can go missing for reasons outside this module: a surface that
 * overrides `white-space` to a collapsing value lets the browser's editing
 * engine drop it on the next keystroke.
 *
 * Gated on the token still being present at that index, so backspacing into a
 * chip (a deliberate way to re-open the picker and pick something else) still
 * works — the value stops matching, and the trigger is honoured again.
 */
export function isInsertedTokenTrigger(
  value: string,
  triggerStartIndex: number,
  inserted: InsertedToken | null,
): boolean {
  if (inserted === null) return false;
  if (triggerStartIndex !== inserted.startIndex) return false;
  return value.startsWith(inserted.token, inserted.startIndex);
}

/**
 * True when an editor value renders as empty. Clearing a contentEditable leaves
 * a browser-inserted bogus `<br>` behind, which round-trips through
 * `extractEditableText` as "\n" — visually empty, so it must not be treated as
 * existing text (e.g. when seeding the composer from a stray keystroke).
 */
export function isEditorValueEmpty(value: string): boolean {
  return value === "" || value === "\n";
}

/** Strip the zero-width spaces injected around mention chips. */
export function normalizeMentionText(text: string): string {
  return text.replace(/​/g, "");
}

/** Walk a contentEditable subtree and reconstruct the text the user sees. */
export function extractEditableText(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof Element) {
      const linkUrl = node.getAttribute("data-link-url");
      if (linkUrl !== null) {
        // Links round-trip to the raw URL from the attribute, so the favicon
        // and `<wbr>` markup never leak into the editor value.
        out += linkUrl;
      } else if (node.tagName === "BR") {
        out += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (out !== "" && !out.endsWith("\n")) out += "\n";
        out += extractEditableText(node);
      } else {
        out += extractEditableText(node);
      }
    }
  }
  return out;
}

export function placeCursorAtEnd(el: Element): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
