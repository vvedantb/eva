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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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
  const role = asString(record.role);
  const name = asString(record.name);
  const selector = asString(record.selector);
  const bbox = parseBbox(record.bbox);
  if (!role || name === null || !selector || !bbox) return null;
  return { role, name, selector, bbox };
}

function parseConsoleEntry(
  value: unknown,
): PreviewSnapshotConsoleEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const level = asString(record.level);
  const text = asString(record.text);
  const at = asNumber(record.at);
  if (!level || text === null || at === null) return null;
  return { level, text, at };
}

function parseNetworkEntry(
  value: unknown,
): PreviewSnapshotNetworkEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const url = asString(record.url);
  const status = asNumber(record.status);
  const at = asNumber(record.at);
  if (!url || status === null || at === null) return null;
  return { url, status, at };
}

function parseA11yNode(value: unknown): PreviewSnapshotA11yNode | null {
  const record = asRecord(value);
  if (!record) return null;
  const role = asString(record.role);
  const name = asString(record.name);
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
  }
  return out;
}

function parseSnapshot(value: unknown): PreviewSnapshot | null {
  const record = asRecord(value);
  if (!record) return null;
  const url = asString(record.url);
  const title = asString(record.title);
  const loading = asBoolean(record.loading);
  const visibleText = asString(record.visibleText);
  if (!url || title === null || loading === null || visibleText === null) {
    return null;
  }
  const screenshot = asRecord(record.screenshot);
  const dataUrl = screenshot ? asString(screenshot.dataUrl) : null;
  return {
    url,
    title,
    loading,
    visibleText,
    interactiveElements: parseList(record.interactiveElements, parseElement),
    accessibilityTree: parseList(record.accessibilityTree, parseA11yNode),
    consoleEntries: parseList(record.consoleEntries, parseConsoleEntry),
    networkEntries: parseList(record.networkEntries, parseNetworkEntry),
    ...(dataUrl && dataUrl.startsWith("data:image/")
      ? { screenshotDataUrl: dataUrl }
      : {}),
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

export function formatSnapshotPrompt(snapshot: PreviewSnapshot): string {
  const interactive = snapshot.interactiveElements
    .slice(0, 40)
    .map(
      (element) =>
        `- ${element.role} "${escapeSnapshotText(element.name)}" ${element.selector}`,
    );
  const consoleLines = snapshot.consoleEntries
    .filter((entry) => entry.level === "error" || entry.level === "warn")
    .slice(-12)
    .map((entry) => `- [${entry.level}] ${escapeSnapshotText(entry.text)}`);
  const networkLines = snapshot.networkEntries.slice(-12).map((entry) => {
    return `- ${entry.status} ${escapeSnapshotText(entry.url)}`;
  });
  const a11y = snapshot.accessibilityTree
    .slice(0, 40)
    .map((node) => `- ${node.role} "${escapeSnapshotText(node.name)}"`);
  return [
    "<preview_snapshot>",
    `url: ${escapeSnapshotText(snapshot.url)}`,
    `title: ${escapeSnapshotText(snapshot.title)}`,
    `loading: ${snapshot.loading ? "true" : "false"}`,
    `visibleText: ${escapeSnapshotText(snapshot.visibleText.slice(0, 4_000))}`,
    "interactive:",
    ...(interactive.length > 0 ? interactive : ["- (none)"]),
    "accessibility:",
    ...(a11y.length > 0 ? a11y : ["- (none)"]),
    "console:",
    ...(consoleLines.length > 0 ? consoleLines : ["- (none)"]),
    "networkFailures:",
    ...(networkLines.length > 0 ? networkLines : ["- (none)"]),
    "</preview_snapshot>",
  ].join("\n");
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
