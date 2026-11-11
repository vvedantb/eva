import { z } from "zod";
import type { AlertEvent } from "./events";

/**
 * Parses the body of an Axiom custom webhook notifier sent with Axiom's
 * default template (see axiom.co/docs/monitor-data/custom-webhook-notifier):
 *
 *   { "action": "Open" | "Closed", "event": { monitorID, title, body, … } }
 *
 * Pure, like `parseRepoEvents`: `http.ts` checks the secret first.
 */

/** Per-field caps, so one huge matched event cannot flood the task. */
const MAX_TITLE_CHARS = 200;
const MAX_TEXT_CHARS = 4_000;
const MAX_MATCHED_EVENT_CHARS = 8_000;

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Scalar = z.infer<typeof scalarSchema>;

type Json = Scalar | Json[] | { [key: string]: Json };
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([scalarSchema, z.array(jsonSchema), z.record(z.string(), jsonSchema)]),
);

const axiomWebhookSchema = z.object({
  action: z.string(),
  event: z.object({
    monitorID: z.string().min(1),
    title: z.string().catch(""),
    description: z.string().catch(""),
    body: z.string().catch(""),
    value: z.number().nullable().optional().catch(null),
    matchedEvent: z
      .record(z.string(), jsonSchema)
      .nullable()
      .optional()
      .catch(null),
    groupKeys: z.array(scalarSchema).nullable().optional().catch(null),
    groupValues: z.array(scalarSchema).nullable().optional().catch(null),
    queryStartTime: z.string().optional().catch(undefined),
    queryEndTime: z.string().optional().catch(undefined),
  }),
});

export type AxiomParseResult =
  | { kind: "alert"; alert: AlertEvent }
  /** A threshold monitor resolving. Nothing to do. */
  | { kind: "resolved" }
  | { kind: "invalid" };

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…(truncated)`;
}

function describeGroup(
  keys: ReadonlyArray<Scalar> | null | undefined,
  values: ReadonlyArray<Scalar> | null | undefined,
): string | undefined {
  if (!keys || !values || keys.length === 0) return undefined;
  return keys
    .map((key, index) => `${String(key)}=${String(values[index] ?? "")}`)
    .join(", ");
}

function parseJson(body: string): ReturnType<typeof axiomWebhookSchema.safeParse> | null {
  try {
    return axiomWebhookSchema.safeParse(JSON.parse(body));
  } catch {
    return null;
  }
}

export function parseAxiomAlert(body: string): AxiomParseResult {
  const parsed = parseJson(body);
  if (parsed === null || !parsed.success) return { kind: "invalid" };
  const { action, event } = parsed.data;
  if (action.toLowerCase() === "closed") return { kind: "resolved" };

  const matchedEvent =
    event.matchedEvent == null
      ? undefined
      : clip(JSON.stringify(event.matchedEvent, null, 2), MAX_MATCHED_EVENT_CHARS);
  const group = describeGroup(event.groupKeys, event.groupValues);
  return {
    kind: "alert",
    alert: {
      kind: "production_alert",
      source: "axiom",
      monitorId: clip(event.monitorID, MAX_TITLE_CHARS),
      title: clip(event.title.trim() || "Untitled monitor", MAX_TITLE_CHARS),
      description: clip(event.description, MAX_TEXT_CHARS),
      body: clip(event.body, MAX_TEXT_CHARS),
      ...(event.value == null ? {} : { value: event.value }),
      ...(matchedEvent === undefined ? {} : { matchedEvent }),
      ...(group === undefined ? {} : { group }),
      ...(event.queryStartTime === undefined
        ? {}
        : { queryStartTime: event.queryStartTime }),
      ...(event.queryEndTime === undefined
        ? {}
        : { queryEndTime: event.queryEndTime }),
    },
  };
}
