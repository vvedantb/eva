import { describe, expect, test } from "vitest";
import {
  appendWebMcpToPrompt,
  formatWebMcpPrompt,
  parseWebMcpInbound,
  webMcpChipLabel,
  DEMO_WEBMCP_DISCOVERY,
} from "./previewWebMcp";

describe("preview WebMCP protocol", () => {
  test("accepts a tool catalogue and rejects a missing origin", () => {
    expect(
      parseWebMcpInbound({
        type: "eva-preview-webmcp-tools",
        requestId: "r1",
        origin: "http://localhost:5173",
        implementation: "compatibility",
        tools: [
          {
            name: "billing.refund",
            description: "Refund an invoice",
            inputSchema: { type: "object", properties: {} },
            readOnly: false,
            source: "modelContext",
          },
        ],
      }),
    ).toMatchObject({
      type: "tools",
      requestId: "r1",
      discovery: {
        origin: "http://localhost:5173",
        tools: [{ name: "billing.refund" }],
      },
    });
    expect(
      parseWebMcpInbound({
        type: "eva-preview-webmcp-tools",
        requestId: "r1",
        implementation: "none",
        tools: [],
      }),
    ).toBeNull();
  });

  test("accepts invoke results and failures", () => {
    expect(
      parseWebMcpInbound({
        type: "eva-preview-webmcp-result",
        requestId: "r2",
        name: "billing.retryInvoices",
        result: { retried: 3 },
      }),
    ).toEqual({
      type: "result",
      requestId: "r2",
      name: "billing.retryInvoices",
      result: { retried: 3 },
    });
    expect(
      parseWebMcpInbound({
        type: "eva-preview-webmcp-error",
        requestId: "r3",
        message: "Unknown tool",
      }),
    ).toEqual({
      type: "error",
      requestId: "r3",
      message: "Unknown tool",
    });
  });

  test("prompt block lists each tool and its schema", () => {
    const block = formatWebMcpPrompt(DEMO_WEBMCP_DISCOVERY);
    expect(block).toContain("<webmcp_tools>");
    expect(block).toContain("billing.refund (Refund invoice)");
    expect(block).toContain("billing.retryInvoices");
    expect(block).toContain('"invoiceId"');
    expect(appendWebMcpToPrompt("Call the page tools", [DEMO_WEBMCP_DISCOVERY])).toBe(
      `Call the page tools\n\n${block}`,
    );
  });

  test("chip label uses the tool count", () => {
    expect(webMcpChipLabel(DEMO_WEBMCP_DISCOVERY)).toBe("WebMCP · 2 tools");
    expect(webMcpChipLabel({ ...DEMO_WEBMCP_DISCOVERY, tools: [] })).toBe(
      "WebMCP · 0 tools",
    );
  });
});
