import { z } from "zod";
import {
  GENERATIVE_UI_BUTTON_VARIANTS,
  GENERATIVE_UI_TEXT_STYLES,
  GENERATIVE_UI_TONES,
} from "@vvedantb/server/generative-ui";
import { isHttpUrl } from "@eva/shared/safeUrl";

export const MAX_BLOCKS = 24;
export const MAX_PROMPT_CHARS = 600;
export const MAX_TEXT_CHARS = 2_000;
export const MAX_CODE_CHARS = 4_000;
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLUMNS = 6;
export const MAX_LIST_ITEMS = 12;
/** Element budget for one panel: the blocks plus the layout around them. */
export const MAX_PANEL_ELEMENTS = 32;

const tone = z.enum(GENERATIVE_UI_TONES);
const shortText = z.string().min(1).max(200);
const bodyText = z.string().min(1).max(MAX_TEXT_CHARS);

const httpUrl = z
  .string()
  .url()
  .refine(isHttpUrl, {
    message: "URL must be http or https",
  });

const headingBlock = z.object({
  kind: z.literal("heading"),
  text: shortText,
});

const textBlock = z.object({
  kind: z.literal("text"),
  text: bodyText,
  emphasis: z.enum(GENERATIVE_UI_TEXT_STYLES).default("body"),
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
  reply: z.string().min(1).max(MAX_TEXT_CHARS).optional(),
  url: httpUrl.optional(),
  variant: z.enum(GENERATIVE_UI_BUTTON_VARIANTS).default("secondary"),
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
      spec: string;
      elementCount: number;
      elapsedMs: number;
      inputTokens: number | null;
      stopReason: "finish" | "limit" | "unavailable";
    }
  | {
      ok: false;
      errorCode: "missing_config" | "invalid_request" | "provider_error";
      error: string;
    };
