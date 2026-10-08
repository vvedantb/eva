import { EDITOR_CHIP_CLICKABLE_CLASS } from "./mentionChipStyles";
import { LINK_URL_SOURCE, linkLabel, linkProvider } from "./linkChipUtils";
import { linkProviderIconHtml } from "./linkProviderIcons";

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      if (segment.type === "link") {
        const url = segment.value;
        const provider = linkProvider(url);
        // gap-1 matches React LinkChip; icon must be inline SVG because the
        // composer chips links via innerHTML (no React tree for the chip).
        const className = `${mentionChipClassName} gap-1 ${EDITOR_CHIP_CLICKABLE_CLASS}`;
        const icon = provider !== null ? linkProviderIconHtml(provider) : "";
        return `​<span data-link-url="${escapeHtml(url)}" contenteditable="false" class="${escapeHtml(className)}">${icon}${escapeHtml(linkLabel(url))}</span>​`;
      }
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
        // Link chips display a friendly label but round-trip to the raw URL,
        // keeping the editor value in sync with what was pasted/persisted.
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
