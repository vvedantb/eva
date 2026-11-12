/**
 * The prop schemas of the chat UI catalog's components (see `catalog.ts`),
 * kept apart from json-render so a client that draws panels natively (the
 * phone app) can validate an element's props without it.
 */

import { z } from "zod";

/** Sentiment shared by metrics, badges and callouts. */
export const CHAT_UI_TONES = [
  "neutral",
  "positive",
  "warning",
  "danger",
] as const;
export type ChatUiTone = (typeof CHAT_UI_TONES)[number];

/** Text styles: the catalog's `Text.variant` and a text block's `emphasis`. */
export const CHAT_UI_TEXT_STYLES = ["body", "muted", "lead"] as const;

/** Button styles, shared by the catalog and the button content block. */
export const CHAT_UI_BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "ghost",
] as const;

const tone = z.enum(CHAT_UI_TONES);
const nullableText = z.string().nullable();

/** Each catalog component's props, by component type. */
export const CHAT_UI_ELEMENT_PROPS = {
  Stack: z.object({
    direction: z.enum(["vertical", "horizontal"]),
    gap: z.enum(["sm", "md", "lg"]),
    align: z.enum(["start", "center", "stretch"]),
  }),
  Grid: z.object({
    columns: z.number().int().min(2).max(3),
    gap: z.enum(["sm", "md"]),
  }),
  Panel: z.object({
    title: nullableText,
    description: nullableText,
  }),
  Heading: z.object({
    text: z.string(),
    level: z.enum(["h2", "h3"]),
  }),
  Text: z.object({
    text: z.string(),
    variant: z.enum(CHAT_UI_TEXT_STYLES),
  }),
  Metric: z.object({
    label: z.string(),
    value: z.string(),
    delta: nullableText,
    tone,
  }),
  Badge: z.object({ text: z.string(), tone }),
  Callout: z.object({ title: nullableText, text: z.string(), tone }),
  Progress: z.object({
    label: nullableText,
    value: z.number().min(0).max(100),
  }),
  Checklist: z.object({
    items: z.array(z.object({ text: z.string(), done: z.boolean() })),
  }),
  Table: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  KeyValue: z.object({
    items: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  Code: z.object({ code: z.string(), language: nullableText }),
  Image: z.object({ url: z.string(), alt: nullableText }),
  Button: z.object({
    label: z.string(),
    variant: z.enum(CHAT_UI_BUTTON_VARIANTS),
  }),
  Separator: z.object({}),
};

export type ChatUiElementType = keyof typeof CHAT_UI_ELEMENT_PROPS;
