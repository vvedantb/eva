import { describe, expect, it } from "vitest";
import {
  HTML_RENDER_MAX_BYTES,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MIN_HEIGHT,
  htmlRenderFrameHeight,
  htmlRenderFrameMessage,
  htmlRenderThemeValue,
  injectHtmlRenderBootstrap,
  type HtmlRenderHostContext,
} from "@eva/shared/htmlRender";
import {
  renderHtmlTool,
  type RenderHtmlInput,
} from "../convex/_mcp/renderHtmlTool";

/**
 * `render_html` is a thin tool over storage, so what needs proving is the
 * boundary: the caps reach the agent as errors before anything is stored, the
 * bootstrap lands where the page cannot be pushed into quirks mode, and the
 * frame only acts on well-formed bridge messages.
 */

const page = "<!doctype html><html><head><title>t</title></head><body>hi</body></html>";
const context: HtmlRenderHostContext = {
  theme: "dark",
  styles: { variables: { "--primary": "rgb(1 2 3)" } },
};

function tool(stored: string | null) {
  const calls: RenderHtmlInput[] = [];
  const instance = renderHtmlTool(async (input) => {
    calls.push(input);
    return stored;
  });
  return { calls, instance };
}

describe("render_html tool", () => {
  it("stores a valid page and returns its id", async () => {
    const { calls, instance } = tool("render123");
    const result = await instance.invoke(
      JSON.stringify({ html: page, title: "Chart", height: 320 }),
    );
    expect(result.isError).toBeUndefined();
    expect(calls).toEqual([{ html: page, title: "Chart", height: 320 }]);
    expect(JSON.stringify(result.content)).toContain("render123");
  });

  it("rejects a height outside the frame bounds", async () => {
    const { calls, instance } = tool("render123");
    // `invoke` parses before it awaits anything, so a bad input throws at once.
    expect(() =>
      instance.invoke(
        JSON.stringify({
          html: page,
          title: "Chart",
          height: HTML_RENDER_MAX_HEIGHT + 1,
        }),
      ),
    ).toThrow();
    expect(calls).toHaveLength(0);
  });

  it("rejects a page over the byte cap, counting multi-byte characters", async () => {
    const { calls, instance } = tool("render123");
    // Under the cap in characters, over it in UTF-8 bytes.
    const html = "é".repeat(HTML_RENDER_MAX_BYTES / 2 + 1);
    expect(() =>
      instance.invoke(JSON.stringify({ html, title: "Big", height: 320 })),
    ).toThrow(/KB of UTF-8/);
    expect(calls).toHaveLength(0);
  });

  it("reports a chat that is gone as a tool error", async () => {
    const { instance } = tool(null);
    const result = await instance.invoke(
      JSON.stringify({ html: page, title: "Chart", height: 320 }),
    );
    expect(result.isError).toBe(true);
  });
});

describe("injectHtmlRenderBootstrap", () => {
  it("puts the bootstrap first in the head, after the doctype", () => {
    const out = injectHtmlRenderBootstrap(page, context);
    expect(out.startsWith("<!doctype html><html><head><style id=\"eva-theme\">")).toBe(true);
    expect(out).toContain("--primary:rgb(1 2 3);");
    expect(out).toContain("color-scheme:dark;");
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("<title>"));
  });

  it("never goes before a doctype when the page has no head or html tag", () => {
    const out = injectHtmlRenderBootstrap("<!DOCTYPE html><p>hi</p>", context);
    expect(out.startsWith("<!DOCTYPE html><style")).toBe(true);
  });

  it("does not mistake <header> for <head>", () => {
    const out = injectHtmlRenderBootstrap("<header>x</header>", context);
    expect(out.startsWith("<style")).toBe(true);
  });

  it("strips characters that could end the theme rule", () => {
    const out = injectHtmlRenderBootstrap(page, {
      theme: "light",
      styles: { variables: { "--x": "red;}</style><script>" } },
    });
    expect(out).toContain("--x:red/stylescript;");
  });
});

describe("frame helpers", () => {
  it("wraps bare RGB channels and leaves other values alone", () => {
    expect(htmlRenderThemeValue(" 244 245 246 ")).toBe("rgb(244 245 246)");
    expect(htmlRenderThemeValue("0.5rem")).toBe("0.5rem");
    expect(htmlRenderThemeValue("")).toBe("");
  });

  it("keeps the frame height in bounds and prefers the reported height", () => {
    expect(htmlRenderFrameHeight(320, null)).toBe(320);
    expect(htmlRenderFrameHeight(320, 512.2)).toBe(513);
    expect(htmlRenderFrameHeight(320, 10)).toBe(HTML_RENDER_MIN_HEIGHT);
    expect(htmlRenderFrameHeight(320, 99_999)).toBe(HTML_RENDER_MAX_HEIGHT);
  });

  it("accepts size and http(s) link messages only", () => {
    const size = htmlRenderFrameMessage.safeParse({
      jsonrpc: "2.0",
      method: "ui/notifications/size-changed",
      params: { height: 240 },
    });
    expect(size.success).toBe(true);
    const link = htmlRenderFrameMessage.safeParse({
      jsonrpc: "2.0",
      id: "eva-link-1",
      method: "ui/open-link",
      params: { url: "https://example.com" },
    });
    expect(link.success).toBe(true);
    const script = htmlRenderFrameMessage.safeParse({
      jsonrpc: "2.0",
      method: "ui/open-link",
      params: { url: "javascript:alert(1)" },
    });
    expect(script.success).toBe(false);
    expect(htmlRenderFrameMessage.safeParse({ method: "other" }).success).toBe(false);
  });
});
