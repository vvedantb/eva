/**
 * The catalog of components and actions the agent can build a chat panel from.
 *
 * This is the guardrail for Eva's generative UI: Jev composes a tree out of
 * these types and nothing else, so a panel can never render arbitrary markup
 * or call anything the chat has not wired up. The backend uses it to validate
 * what the composer produced; the web app registers a React component for each
 * entry (see `apps/web/src/lib/components/chat/generativeUi`).
 *
 * The prop schemas are deliberately closed sets of strings — every value is
 * supplied by the agent as a content block, never invented by the model.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/** Sentiment shared by metrics, badges and callouts. */
export const CHAT_UI_TONES = [
  "neutral",
  "positive",
  "warning",
  "danger",
] as const;
export type ChatUiTone = (typeof CHAT_UI_TONES)[number];

const tone = z.enum(CHAT_UI_TONES);
const nullableText = z.string().nullable();

export const chatUiCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]),
        gap: z.enum(["sm", "md", "lg"]),
        align: z.enum(["start", "center", "stretch"]),
      }),
      slots: ["default"],
      description: "Layout row or column that holds other elements.",
    },
    Grid: {
      props: z.object({
        columns: z.number().int().min(2).max(3),
        gap: z.enum(["sm", "md"]),
      }),
      slots: ["default"],
      description: "Equal-width columns, e.g. a row of metrics.",
    },
    Panel: {
      props: z.object({
        title: nullableText,
        description: nullableText,
      }),
      slots: ["default"],
      description: "Bordered container grouping related content.",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["h2", "h3"]),
      }),
      description: "Section title.",
    },
    Text: {
      props: z.object({
        text: z.string(),
        variant: z.enum(["body", "muted", "lead"]),
      }),
      description: "A paragraph of read-only prose.",
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        delta: nullableText,
        tone,
      }),
      description: "One labelled number or short value.",
    },
    Badge: {
      props: z.object({ text: z.string(), tone }),
      description: "Small status pill.",
    },
    Callout: {
      props: z.object({ title: nullableText, text: z.string(), tone }),
      description: "Highlighted note, warning or result.",
    },
    Progress: {
      props: z.object({
        label: nullableText,
        value: z.number().min(0).max(100),
      }),
      description: "Completion bar from 0 to 100.",
    },
    Checklist: {
      props: z.object({
        items: z.array(z.object({ text: z.string(), done: z.boolean() })),
      }),
      description: "List of done / not-done items.",
    },
    Table: {
      props: z.object({
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
      }),
      description: "Small table of rows and columns.",
    },
    KeyValue: {
      props: z.object({
        items: z.array(z.object({ label: z.string(), value: z.string() })),
      }),
      description: "Label / value pairs, e.g. a summary of settings.",
    },
    Code: {
      props: z.object({ code: z.string(), language: nullableText }),
      description: "Preformatted code or command output.",
    },
    Image: {
      props: z.object({ url: z.string(), alt: nullableText }),
      description: "A screenshot or diagram already hosted at a URL.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "ghost"]),
      }),
      events: ["press"],
      description: "Clickable button that replies in the chat or opens a link.",
    },
    Separator: {
      props: z.object({}),
      description: "Horizontal rule between sections.",
    },
  },
  actions: {
    reply: {
      params: z.object({ message: z.string() }),
      description: "Send the given text back to the agent as a chat message.",
    },
    open_url: {
      params: z.object({ url: z.string() }),
      description: "Open a link in a new tab.",
    },
  },
});
