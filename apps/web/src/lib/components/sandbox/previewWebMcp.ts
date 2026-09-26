import { asRecord } from "@/lib/utils/looseRecord";

/** A value that JSON.stringify is guaranteed to handle: no cycles, no BigInt. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export interface WebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: { readonly [key: string]: JsonValue };
  readonly readOnly: boolean;
  readonly source: "modelContext" | "form";
}

export interface WebMcpDiscovery {
  readonly origin: string;
  readonly implementation: string;
  readonly tools: ReadonlyArray<WebMcpTool>;
}

export type WebMcpInbound =
  | { type: "tools"; requestId: string; discovery: WebMcpDiscovery }
  | { type: "result"; requestId: string; name: string; result: unknown }
  | { type: "error"; requestId: string; message: string };

/**
 * The preview iframe hosts the user's own app, so every field below is
 * attacker-controlled. Caps are applied at parse time so nothing oversized is
 * retained in React state or re-serialised on every render.
 */
const MAX_TOOLS = 64;
const MAX_NAME_LENGTH = 128;
const NAME_PATTERN = new RegExp(`^[A-Za-z0-9_.-]{1,${MAX_NAME_LENGTH}}$`);
const MAX_ORIGIN_LENGTH = 256;
const MAX_IMPLEMENTATION_LENGTH = 128;
const MAX_TITLE_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 4_096;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_NODES = 512;
const MAX_SCHEMA_STRING_LENGTH = 512;
const MAX_SCHEMA_ARRAY_ITEMS = 64;
const MAX_SCHEMA_KEYS = 64;
/** Source text a page may hand us for a schema, before it is JSON.parsed. */
const MAX_SCHEMA_SOURCE_LENGTH = 64_000;
/** Budget for the body of one <webmcp_tools> block, delimiters excluded. */
const MAX_PROMPT_BODY_LENGTH = 32_000;

const EMPTY_SCHEMA: { readonly [key: string]: JsonValue } = {
  type: "object",
  properties: {},
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asCappedString(value: unknown, max: number): string | null {
  const text = asString(value);
  return text === null ? null : text.slice(0, max);
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * postMessage uses structured clone, which happily delivers cycles, BigInt,
 * Date, Map and Set — all of which make JSON.stringify throw or lie. Rebuild
 * the schema as plain JSON so stringifying it (in the prompt and on every
 * dialog render) is total. `undefined` means "drop this entry".
 */
function toJsonValue(
  value: unknown,
  depth: number,
  ancestors: Set<object>,
  budget: { remaining: number },
): JsonValue | undefined {
  if (budget.remaining <= 0 || depth > MAX_SCHEMA_DEPTH) return undefined;
  budget.remaining -= 1;
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, MAX_SCHEMA_STRING_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value !== "object") return undefined;
  // Already on the current path: following it again would never terminate.
  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const source: ReadonlyArray<unknown> = value;
      const items: JsonValue[] = [];
      for (const entry of source.slice(0, MAX_SCHEMA_ARRAY_ITEMS)) {
        const parsed = toJsonValue(entry, depth + 1, ancestors, budget);
        // JSON.stringify writes null for dropped array entries; do the same so
        // positions stay meaningful.
        items.push(parsed === undefined ? null : parsed);
      }
      return items;
    }
    // Date, Map, Set, RegExp and friends survive structured clone but do not
    // round-trip through JSON; only plain objects are kept.
    const record = isPlainObject(value) ? asRecord(value) : null;
    return record ? toJsonRecord(record, depth, ancestors, budget) : undefined;
  } finally {
    ancestors.delete(value);
  }
}

function toJsonRecord(
  record: Record<string, unknown>,
  depth: number,
  ancestors: Set<object>,
  budget: { remaining: number },
): { readonly [key: string]: JsonValue } {
  const out: Record<string, JsonValue> = {};
  let keys = 0;
  for (const [key, entry] of Object.entries(record)) {
    if (keys >= MAX_SCHEMA_KEYS) break;
    const parsed = toJsonValue(entry, depth + 1, ancestors, budget);
    if (parsed === undefined) continue;
    out[key.slice(0, MAX_SCHEMA_STRING_LENGTH)] = parsed;
    keys += 1;
  }
  return out;
}

function parseInputSchema(value: unknown): {
  readonly [key: string]: JsonValue;
} {
  if (typeof value === "string") {
    try {
      return parseInputSchema(
        JSON.parse(value.slice(0, MAX_SCHEMA_SOURCE_LENGTH)),
      );
    } catch {
      return EMPTY_SCHEMA;
    }
  }
  const record = asRecord(value);
  if (!record) return EMPTY_SCHEMA;
  // asRecord copies the top level, so seed the walk with the original object:
  // a schema that points back at its own root is a cycle like any other.
  const ancestors = new Set<object>();
  if (typeof value === "object" && value !== null) ancestors.add(value);
  return toJsonRecord(record, 0, ancestors, {
    remaining: MAX_SCHEMA_NODES,
  });
}

function parseSource(value: unknown): WebMcpTool["source"] {
  return value === "form" ? "form" : "modelContext";
}

function parseTool(value: unknown): WebMcpTool | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = asCappedString(record.name, MAX_NAME_LENGTH)?.trim() ?? "";
  const description =
    asCappedString(record.description, MAX_DESCRIPTION_LENGTH)?.trim() ?? "";
  if (!NAME_PATTERN.test(name) || description.length === 0) {
    return null;
  }
  const title = asCappedString(record.title, MAX_TITLE_LENGTH)?.trim();
  const readOnly = asBoolean(record.readOnly) ?? false;
  return {
    name,
    ...(title ? { title } : {}),
    description: description.slice(0, MAX_DESCRIPTION_LENGTH),
    inputSchema: parseInputSchema(record.inputSchema),
    readOnly,
    source: parseSource(record.source),
  };
}

function parseTools(value: unknown): WebMcpTool[] {
  if (!Array.isArray(value)) return [];
  const out: WebMcpTool[] = [];
  for (const entry of value) {
    const tool = parseTool(entry);
    if (tool) out.push(tool);
    if (out.length >= MAX_TOOLS) break;
  }
  return out;
}

function parseDiscovery(value: unknown): WebMcpDiscovery | null {
  const record = asRecord(value);
  if (!record) return null;
  const origin = asCappedString(record.origin, MAX_ORIGIN_LENGTH);
  const implementation = asCappedString(
    record.implementation,
    MAX_IMPLEMENTATION_LENGTH,
  );
  if (!origin || !implementation) return null;
  return {
    origin,
    implementation,
    tools: parseTools(record.tools),
  };
}

export function parseWebMcpInbound(data: object): WebMcpInbound | null {
  if (!("type" in data) || typeof data.type !== "string") return null;
  if (!("requestId" in data) || typeof data.requestId !== "string") {
    return null;
  }
  if (data.type === "eva-preview-webmcp-tools") {
    const discovery = parseDiscovery(data);
    if (!discovery) return null;
    return { type: "tools", requestId: data.requestId, discovery };
  }
  if (data.type === "eva-preview-webmcp-result") {
    if (!("name" in data) || typeof data.name !== "string") return null;
    return {
      type: "result",
      requestId: data.requestId,
      name: data.name,
      result: "result" in data ? data.result : null,
    };
  }
  if (data.type === "eva-preview-webmcp-error") {
    if (!("message" in data) || typeof data.message !== "string") return null;
    return { type: "error", requestId: data.requestId, message: data.message };
  }
  return null;
}

function escapeWebMcpText(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

export function formatWebMcpPrompt(discovery: WebMcpDiscovery): string {
  const lines = discovery.tools.map((tool) => {
    const title = tool.title ? ` (${escapeWebMcpText(tool.title)})` : "";
    const readonly = tool.readOnly ? " [read-only]" : "";
    // Total by construction: parseInputSchema guarantees plain JSON.
    const schema = escapeWebMcpText(JSON.stringify(tool.inputSchema));
    return `- ${tool.name}${title}${readonly}: ${escapeWebMcpText(tool.description)}\n  input: ${schema}`;
  });
  const body = [
    `origin: ${escapeWebMcpText(discovery.origin)}`,
    `implementation: ${escapeWebMcpText(discovery.implementation)}`,
    ...(lines.length > 0 ? lines : ["- (none)"]),
  ].join("\n");
  // Backstop on the assembled block: 64 tools × their caps still leave room for
  // a very large prompt. Truncating escaped text cannot resurrect a "<".
  const bounded =
    body.length > MAX_PROMPT_BODY_LENGTH
      ? `${body.slice(0, MAX_PROMPT_BODY_LENGTH)}\n(truncated)`
      : body;
  return `<webmcp_tools>\n${bounded}\n</webmcp_tools>`;
}

export function appendWebMcpToPrompt(
  prompt: string,
  discoveries: ReadonlyArray<WebMcpDiscovery>,
): string {
  if (discoveries.length === 0) return prompt;
  const blocks = discoveries.map(formatWebMcpPrompt).join("\n\n");
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${blocks}` : blocks;
}

export function webMcpChipLabel(discovery: WebMcpDiscovery): string {
  const count = discovery.tools.length;
  return `WebMCP · ${count} tool${count === 1 ? "" : "s"}`;
}

export const DEMO_WEBMCP_DISCOVERY: WebMcpDiscovery = {
  origin: "http://localhost:5173",
  implementation: "compatibility",
  tools: [
    {
      name: "billing.refund",
      title: "Refund invoice",
      description: "Refund an invoice by id. Amount defaults to the remaining balance.",
      inputSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "string", description: "Invoice to refund" },
          amountCents: { type: "number" },
        },
        required: ["invoiceId"],
      },
      readOnly: false,
      source: "modelContext",
    },
    {
      name: "billing.retryInvoices",
      title: "Retry failed invoices",
      description: "Replay the last failed invoice fetch without leaving the page.",
      inputSchema: { type: "object", properties: {} },
      readOnly: false,
      source: "modelContext",
    },
  ],
};
