/**
 * The `render_ui` request contract: the content blocks an agent hands Eva and
 * the caps that keep one panel a panel.
 *
 * Runtime-free (zod only) so the MCP tool in the V8 isolate and the
 * `"use node"` composition client share one definition, mirroring
 * `_jev/schema.ts`.
 *
 * The split matters: the agent owns every string a panel displays, and Jev
 * only decides how those strings are arranged. Nothing here lets a model
 * invent copy.
 */

import { z } from "zod";
import { CHAT_UI_TONES } from "@eva/shared/generativeUi";

export const MAX_BLOCKS = 24;
export const MAX_PROMPT_CHARS = 600;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_CODE_CHARS = 4_000;
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_LIST_ITEMS = 12;
/** Element budget for one panel: the blocks plus the layout around them. */
export const MAX_PANEL_ELEMENTS = 32;

const tone = z.enum(CHAT_UI_TONES);
const shortText = z.string().min(1).max(200);
const bodyText = z.string().min(1).max(MAX_TEXT_CHARS);

/**
 * A link the chat will open or load. `.url()` alone accepts `javascript:` and
 * `data:`, which a button in the user's own session must never carry, so the
 * scheme is checked as well.
 */
const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:$/.test(new URL(value).protocol), {
    message: "URL must be http or https",
  });

const headingBlock = z.object({
  kind: z.literal("heading"),
  text: shortText,
});

const textBlock = z.object({
  kind: z.literal("text"),
  text: bodyText,
  emphasis: z.enum(["body", "lead", "muted"]).default("body"),
});

const metricBlock = z.object({
  kind: z.literal("metric"),
  label: shortText,
  value: shortText,
  delta: shortText.optional(),
  tone: tone.default("neutral"),
});

const badgeBlock = z.object({
  kind: z.literal("badge"),
  text: shortText,
  tone: tone.default("neutral"),
});

const calloutBlock = z.object({
  kind: z.literal("callout"),
  text: bodyText,
  title: shortText.optional(),
  tone: tone.default("neutral"),
});

const progressBlock = z.object({
  kind: z.literal("progress"),
  value: z.number().min(0).max(100),
  label: shortText.optional(),
});

const checklistBlock = z.object({
  kind: z.literal("checklist"),
  items: z
    .array(z.object({ text: shortText, done: z.boolean().default(false) }))
    .min(1)
    .max(MAX_LIST_ITEMS),
});

const tableBlock = z.object({
  kind: z.literal("table"),
  columns: z.array(shortText).min(1).max(MAX_TABLE_COLUMNS),
  rows: z.array(z.array(z.string().max(200))).min(1).max(MAX_TABLE_ROWS),
});

const keyValueBlock = z.object({
  kind: z.literal("keyValue"),
  items: z
    .array(z.object({ label: shortText, value: shortText }))
    .min(1)
    .max(MAX_LIST_ITEMS),
});

const codeBlock = z.object({
  kind: z.literal("code"),
  code: z.string().min(1).max(MAX_CODE_CHARS),
  language: shortText.optional(),
});

const imageBlock = z.object({
  kind: z.literal("image"),
  url: httpUrl,
  alt: shortText.optional(),
});

const buttonBlock = z.object({
  kind: z.literal("button"),
  label: shortText,
  /** Text posted back into the chat when pressed. */
  reply: z.string().min(1).max(MAX_TEXT_CHARS).optional(),
  /** Opened in a new tab when pressed. Ignored when `reply` is set. */
  url: httpUrl.optional(),
  variant: z.enum(["primary", "secondary", "ghost"]).default("secondary"),
});

export const chatUiBlock = z.discriminatedUnion("kind", [
  headingBlock,
  textBlock,
  metricBlock,
  badgeBlock,
  calloutBlock,
  progressBlock,
  checklistBlock,
  tableBlock,
  keyValueBlock,
  codeBlock,
  imageBlock,
  buttonBlock,
]);

export type ChatUiBlock = z.output<typeof chatUiBlock>;

/** The raw shape the MCP tool advertises, so `defineTool` can reuse it. */
export const renderUiInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(MAX_PROMPT_CHARS)
    .describe(
      "How the panel should be laid out, in plain words (for example: a metric row above a short summary and two buttons). Layout only — every word the panel displays comes from `blocks`.",
    ),
  title: z
    .string()
    .max(200)
    .optional()
    .describe("Optional heading for the panel container."),
  blocks: z
    .array(chatUiBlock)
    .min(1)
    .max(MAX_BLOCKS)
    .describe("The content of the panel, in rough reading order."),
};

export const renderUiInput = z.object(renderUiInputShape);
export type RenderUiInput = z.output<typeof renderUiInput>;

/** What callers hand `composeChatUiPanel` before defaults are applied. */
export type RenderUiInputRaw = z.input<typeof renderUiInput>;

/** Composition result, returned as data so callers can report and move on. */
export type ComposeOutcome =
  | {
      ok: true;
      /** The composed spec, serialised for storage. */
      spec: string;
      elementCount: number;
      elapsedMs: number;
      inputTokens: number | null;
      /** "limit" means the element budget stopped the composer early. */
      stopReason: "finish" | "limit" | "unavailable";
    }
  | {
      ok: false;
      errorCode: "missing_config" | "invalid_request" | "provider_error";
      error: string;
    };
