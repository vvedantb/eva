import { asRecord } from "@/lib/utils/looseRecord";

export interface WebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
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

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseInputSchema(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return parseInputSchema(JSON.parse(value));
    } catch {
      return { type: "object", properties: {} };
    }
  }
  return asRecord(value) ?? { type: "object", properties: {} };
}

function parseSource(value: unknown): WebMcpTool["source"] {
  return value === "form" ? "form" : "modelContext";
}

function parseTool(value: unknown): WebMcpTool | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = asString(record.name)?.trim() ?? "";
  const description = asString(record.description)?.trim() ?? "";
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name) || description.length === 0) {
    return null;
  }
  const title = asString(record.title)?.trim();
  const readOnly = asBoolean(record.readOnly) ?? false;
  return {
    name,
    ...(title ? { title } : {}),
    description: description.slice(0, 4_096),
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
    if (out.length >= 64) break;
  }
  return out;
}

function parseDiscovery(value: unknown): WebMcpDiscovery | null {
  const record = asRecord(value);
  if (!record) return null;
  const origin = asString(record.origin);
  const implementation = asString(record.implementation);
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
    const schema = escapeWebMcpText(JSON.stringify(tool.inputSchema));
    return `- ${tool.name}${title}${readonly}: ${escapeWebMcpText(tool.description)}\n  input: ${schema}`;
  });
  return [
    "<webmcp_tools>",
    `origin: ${escapeWebMcpText(discovery.origin)}`,
    `implementation: ${escapeWebMcpText(discovery.implementation)}`,
    ...(lines.length > 0 ? lines : ["- (none)"]),
    "</webmcp_tools>",
  ].join("\n");
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
