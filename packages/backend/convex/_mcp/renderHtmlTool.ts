/**
 * The `render_html` MCP tool: the agent hands Eva one self-contained HTML
 * page, and the page renders inline in the chat in a sandboxed frame.
 *
 * `render_ui` stays the tool for structured panels (numbers, checklists,
 * closed questions); this one is for what blocks cannot express — custom
 * charts, diagrams, mockups, small interactive pages. Storage is injected as
 * `run`, which keeps the Convex types out of this module and lets tests pass a
 * fake.
 */

import { z } from "zod";
import {
  HTML_RENDER_MAX_BYTES,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_TITLE_CHARS,
  HTML_RENDER_MIN_HEIGHT,
  HTML_RENDER_PAGE_GUIDE,
} from "@eva/shared/htmlRender";
import { defineTool, type EvaTool } from "../mcp/registry";
import { errorResult, textResult } from "../mcp/toolShared";

export const renderHtmlInputShape = {
  html: z
    .string()
    .min(1)
    .refine(
      (html) => new TextEncoder().encode(html).byteLength <= HTML_RENDER_MAX_BYTES,
      `The page must be at most ${HTML_RENDER_MAX_BYTES / 1000} KB of UTF-8. Move large data out, or load a library from a CDN instead of inlining it.`,
    )
    .describe("A complete, self-contained HTML document."),
  title: z
    .string()
    .min(1)
    .max(HTML_RENDER_MAX_TITLE_CHARS)
    .describe("Short name for the page, read by screen readers."),
  height: z
    .number()
    .int()
    .min(HTML_RENDER_MIN_HEIGHT)
    .max(HTML_RENDER_MAX_HEIGHT)
    .describe(
      `First frame height in CSS px, ${HTML_RENDER_MIN_HEIGHT}-${HTML_RENDER_MAX_HEIGHT}. The frame then follows the page's own height, up to ${HTML_RENDER_MAX_HEIGHT}px; taller pages scroll inside it.`,
    ),
};

export type RenderHtmlInput = z.infer<z.ZodObject<typeof renderHtmlInputShape>>;

export const RENDER_HTML_DESCRIPTION = `Show a finished HTML page (chart, diagram, table, mockup, small interactive tool) inline in this chat, under your current reply. Use \`render_ui\` instead for plain numbers, checklists and closed questions; use this tool when a layout of blocks cannot express the result.

The reader sees the page first; your text reply moves behind a "Text" tab. So do not announce or restate the page in your reply — add only what the page does not say.

Check the page before you call this tool: write it to a file in the sandbox and screenshot it with agent-browser at about 720px wide, in light and dark.

${HTML_RENDER_PAGE_GUIDE}

The page runs in a sandbox with no access to Eva, the user's session or the repo. Requires a session, quick task or project sandbox.`;

/** Builds the tool over an injected store call. `tools.ts` passes the Convex path; tests pass a fake. */
export function renderHtmlTool(
  run: (input: RenderHtmlInput) => Promise<string | null>,
): EvaTool {
  return defineTool({
    name: "render_html",
    description: RENDER_HTML_DESCRIPTION,
    mutating: true,
    input: renderHtmlInputShape,
    handler: async (input) => {
      const renderId = await run(input);
      if (renderId === null) {
        return errorResult(
          "render_html could not store the page: this sandbox is not attached to a chat any more.",
        );
      }
      return textResult({
        renderId,
        status: "rendered",
        message:
          "Shown to the reader above your reply. Do not describe the page; reply with only what it does not already say.",
      });
    },
  });
}
