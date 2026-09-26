import { asRecord } from "@/lib/utils/looseRecord";

export interface PreviewSnapshotElement {
  readonly role: string;
  readonly name: string;
  readonly selector: string;
  readonly bbox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface PreviewSnapshotConsoleEntry {
  readonly level: string;
  readonly text: string;
  readonly at: number;
}

export interface PreviewSnapshotNetworkEntry {
  readonly url: string;
  readonly status: number;
  readonly at: number;
}

export interface PreviewSnapshotA11yNode {
  readonly role: string;
  readonly name: string;
}

export interface PreviewSnapshot {
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
  readonly visibleText: string;
  readonly interactiveElements: ReadonlyArray<PreviewSnapshotElement>;
  readonly accessibilityTree: ReadonlyArray<PreviewSnapshotA11yNode>;
  readonly consoleEntries: ReadonlyArray<PreviewSnapshotConsoleEntry>;
  readonly networkEntries: ReadonlyArray<PreviewSnapshotNetworkEntry>;
  readonly screenshotDataUrl?: string;
}

export type PreviewSnapshotInbound =
  | { type: "snapshot"; requestId: string; snapshot: PreviewSnapshot }
  | { type: "error"; requestId: string; message: string };

/**
 * The preview iframe hosts the user's own app, so every field below is
 * attacker-controlled. Caps are applied at parse time (not at format time) so
 * nothing oversized is ever retained in React state either.
 */
const MAX_LIST_ITEMS = 200;
const MAX_TOKEN_LENGTH = 64;
const MAX_NAME_LENGTH = 256;
const MAX_SELECTOR_LENGTH = 256;
const MAX_CONSOLE_TEXT_LENGTH = 2_000;
const MAX_URL_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 256;
const MAX_VISIBLE_TEXT_LENGTH = 4_000;
/** ~1.5 MB of base64, i.e. a large full-page PNG; longer is dropped, not cut. */
const MAX_SCREENSHOT_DATA_URL_LENGTH = 2_000_000;
/** Budget for the body of one <preview_snapshot> block, delimiters excluded. */
const MAX_PROMPT_BODY_LENGTH = 32_000;

/**
 * Roles and console levels are known vocabularies, not free text. Rejecting
 * anything else here means they can never carry newlines or prompt delimiters,
 * whatever a future caller does with them.
 */
const TOKEN_PATTERN = new RegExp(
  `^[A-Za-z][A-Za-z0-9 _-]{0,${MAX_TOKEN_LENGTH}}$`,
);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asCappedString(value: unknown, max: number): string | null {
  const text = asString(value);
  return text === null ? null : text.slice(0, max);
}

function asToken(value: unknown): string | null {
  const role = asString(value);
  return role !== null && TOKEN_PATTERN.test(role) ? role : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseBbox(value: unknown): PreviewSnapshotElement["bbox"] | null {
  const record = asRecord(value);
  if (!record) return null;
  const x = asNumber(record.x);
  const y = asNumber(record.y);
  const width = asNumber(record.width);
  const height = asNumber(record.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  return { x, y, width, height };
}

function parseElement(value: unknown): PreviewSnapshotElement | null {
  const record = asRecord(value);
  if (!record) return null;
  const role = asToken(record.role);
  const name = asCappedString(record.name, MAX_NAME_LENGTH);
  const selector = asCappedString(record.selector, MAX_SELECTOR_LENGTH);
  const bbox = parseBbox(record.bbox);
  if (!role || name === null || !selector || !bbox) return null;
  return { role, name, selector, bbox };
}

function parseConsoleEntry(
  value: unknown,
): PreviewSnapshotConsoleEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const level = asToken(record.level);
  const text = asCappedString(record.text, MAX_CONSOLE_TEXT_LENGTH);
  const at = asNumber(record.at);
  if (!level || text === null || at === null) return null;
  return { level, text, at };
}

function parseNetworkEntry(
  value: unknown,
): PreviewSnapshotNetworkEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const url = asCappedString(record.url, MAX_URL_LENGTH);
  const status = asNumber(record.status);
  const at = asNumber(record.at);
  if (!url || status === null || at === null) return null;
  return { url, status, at };
}

function parseA11yNode(value: unknown): PreviewSnapshotA11yNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const role = asToken(record.role);
  const name = asCappedString(record.name, MAX_NAME_LENGTH);
  if (!role || name === null) return null;
  return { role, name };
}

function parseList<T>(
  value: unknown,
  parseOne: (entry: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const entry of value) {
    const parsed = parseOne(entry);
    if (parsed) out.push(parsed);
    // Stop early: a hostile page can send millions of entries, and everything
    // that survives here is retained in React state.
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

function parseSnapshot(value: unknown): PreviewSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const url = asCappedString(record.url, MAX_URL_LENGTH);
  const title = asCappedString(record.title, MAX_TITLE_LENGTH);
  const loading = asBoolean(record.loading);
  const visibleText = asCappedString(record.visibleText, MAX_VISIBLE_TEXT_LENGTH);
  if (!url || title === null || loading === null || visibleText === null) {
    return null;
  }
  const screenshot = asRecord(record.screenshot);
  const dataUrl = screenshot ? asString(screenshot.dataUrl) : null;
  const usableDataUrl =
    dataUrl &&
    dataUrl.startsWith("data:image/") &&
    dataUrl.length <= MAX_SCREENSHOT_DATA_URL_LENGTH
      ? dataUrl
      : null;
  return {
    url,
    title,
    loading,
    visibleText,
    interactiveElements: parseList(record.interactiveElements, parseElement),
    accessibilityTree: parseList(record.accessibilityTree, parseA11yNode),
    consoleEntries: parseList(record.consoleEntries, parseConsoleEntry),
    networkEntries: parseList(record.networkEntries, parseNetworkEntry),
    ...(usableDataUrl ? { screenshotDataUrl: usableDataUrl } : {}),
  };
}

export function parseSnapshotInbound(
  data: object,
): PreviewSnapshotInbound | null {
  if (!("type" in data) || typeof data.type !== "string") return null;
  if (!("requestId" in data) || typeof data.requestId !== "string") {
    return null;
  }
  if (data.type === "eva-preview-snapshot") {
    if (!("snapshot" in data)) return null;
    const snapshot = parseSnapshot(data.snapshot);
    if (!snapshot) return null;
    return { type: "snapshot", requestId: data.requestId, snapshot };
  }
  if (data.type === "eva-preview-snapshot-error") {
    if (!("message" in data) || typeof data.message !== "string") return null;
    return { type: "error", requestId: data.requestId, message: data.message };
  }
  return null;
}

function escapeSnapshotText(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

const PROMPT_INTERACTIVE_LIMIT = 40;
const PROMPT_A11Y_LIMIT = 40;
const PROMPT_CONSOLE_LIMIT = 12;
const PROMPT_NETWORK_LIMIT = 12;

export interface SnapshotPromptSelection {
  readonly interactiveElements: ReadonlyArray<PreviewSnapshotElement>;
  readonly accessibilityTree: ReadonlyArray<PreviewSnapshotA11yNode>;
  readonly consoleEntries: ReadonlyArray<PreviewSnapshotConsoleEntry>;
  readonly networkEntries: ReadonlyArray<PreviewSnapshotNetworkEntry>;
  readonly visibleText: string;
}

/**
 * The single source of truth for what leaves the page: the review dialog and
 * the prompt both render this, so the user can never be shown less than what
 * is sent.
 */
export function selectSnapshotForPrompt(
  snapshot: PreviewSnapshot,
): SnapshotPromptSelection {
  return {
    interactiveElements: snapshot.interactiveElements.slice(
      0,
      PROMPT_INTERACTIVE_LIMIT,
    ),
    accessibilityTree: snapshot.accessibilityTree.slice(0, PROMPT_A11Y_LIMIT),
    consoleEntries: snapshot.consoleEntries
      .filter((entry) => entry.level === "error" || entry.level === "warn")
      .slice(-PROMPT_CONSOLE_LIMIT),
    networkEntries: snapshot.networkEntries.slice(-PROMPT_NETWORK_LIMIT),
    visibleText: snapshot.visibleText,
  };
}

export function formatSnapshotPrompt(snapshot: PreviewSnapshot): string {
  const selected = selectSnapshotForPrompt(snapshot);
  const interactive = selected.interactiveElements.map(
    (element) =>
      `- ${escapeSnapshotText(element.role)} "${escapeSnapshotText(element.name)}" ${escapeSnapshotText(element.selector)}`,
  );
  const consoleLines = selected.consoleEntries.map(
    (entry) =>
      `- [${escapeSnapshotText(entry.level)}] ${escapeSnapshotText(entry.text)}`,
  );
  const networkLines = selected.networkEntries.map((entry) => {
    return `- ${entry.status} ${escapeSnapshotText(entry.url)}`;
  });
  const a11y = selected.accessibilityTree.map(
    (node) =>
      `- ${escapeSnapshotText(node.role)} "${escapeSnapshotText(node.name)}"`,
  );
  const body = [
    `url: ${escapeSnapshotText(snapshot.url)}`,
    `title: ${escapeSnapshotText(snapshot.title)}`,
    `loading: ${snapshot.loading ? "true" : "false"}`,
    `visibleText: ${escapeSnapshotText(selected.visibleText)}`,
    "interactive:",
    ...(interactive.length > 0 ? interactive : ["- (none)"]),
    "accessibility:",
    ...(a11y.length > 0 ? a11y : ["- (none)"]),
    "console:",
    ...(consoleLines.length > 0 ? consoleLines : ["- (none)"]),
    "networkFailures:",
    ...(networkLines.length > 0 ? networkLines : ["- (none)"]),
  ].join("\n");
  // Backstop on the assembled block: per-field caps multiplied by per-list caps
  // still leave room for a very large prompt, and the escape pass can grow the
  // text sixfold. Truncating escaped text is safe — it cannot resurrect a "<".
  const bounded =
    body.length > MAX_PROMPT_BODY_LENGTH
      ? `${body.slice(0, MAX_PROMPT_BODY_LENGTH)}\n(truncated)`
      : body;
  return `<preview_snapshot>\n${bounded}\n</preview_snapshot>`;
}

export function appendSnapshotsToPrompt(
  prompt: string,
  snapshots: ReadonlyArray<PreviewSnapshot>,
): string {
  if (snapshots.length === 0) return prompt;
  const blocks = snapshots.map(formatSnapshotPrompt).join("\n\n");
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${blocks}` : blocks;
}

export function snapshotChipLabel(snapshot: PreviewSnapshot): string {
  const path = (() => {
    try {
      return new URL(snapshot.url).pathname || "/";
    } catch {
      return snapshot.title || "snapshot";
    }
  })();
  const count = snapshot.interactiveElements.length;
  return `Snapshot · ${path} · ${count} control${count === 1 ? "" : "s"}`;
}

export const DEMO_PREVIEW_SNAPSHOT: PreviewSnapshot = {
  url: "http://localhost:5173/billing",
  title: "Billing · Acme",
  loading: false,
  visibleText:
    "Billing Current plan: Team Invoices Upgrade Now Failed to load invoices.",
  interactiveElements: [
    {
      role: "button",
      name: "Upgrade",
      selector: "button.upgrade",
      bbox: { x: 24, y: 88, width: 96, height: 32 },
    },
    {
      role: "link",
      name: "Invoices",
      selector: "a[href='/invoices']",
      bbox: { x: 24, y: 140, width: 72, height: 20 },
    },
    {
      role: "button",
      name: "Retry",
      selector: "button.retry",
      bbox: { x: 24, y: 220, width: 72, height: 32 },
    },
  ],
  accessibilityTree: [
    { role: "banner", name: "Acme" },
    { role: "heading", name: "Billing" },
    { role: "main", name: "Billing" },
  ],
  consoleEntries: [
    {
      level: "error",
      text: "Failed to load invoices: 500",
      at: 1_778_000_000_000,
    },
  ],
  networkEntries: [
    { url: "/api/invoices", status: 500, at: 1_778_000_000_000 },
  ],
};
