/**
 * Boundary parser for a stored chat UI spec.
 *
 * Panels are persisted as a JSON string, so both the chat renderer and any
 * later consumer have to re-establish the shape. The schema is deliberately
 * narrower than json-render's own `Spec`: composition only ever emits the
 * fields listed here (our candidates carry no `visible`, `repeat` or `watch`),
 * so anything else in a stored row is corruption rather than a feature.
 */

import type { Spec } from "@json-render/core";
import { z } from "zod";

/** Action params our candidates emit — plain JSON scalars, never bindings. */
const actionParam = z.union([z.string(), z.number(), z.boolean()]);

const actionBinding = z.object({
  action: z.string(),
  params: z.record(z.string(), actionParam).optional(),
});

const uiElement = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()).optional(),
  slots: z.record(z.string(), z.array(z.string())).optional(),
  on: z.record(z.string(), actionBinding).optional(),
});

/** Annotated so a drift between this schema and json-render fails the build. */
const chatUiSpecSchema: z.ZodType<Spec> = z.object({
  root: z.string(),
  elements: z.record(z.string(), uiElement),
  state: z.record(z.string(), z.unknown()).optional(),
});

/** Parses a stored spec string. Returns null for anything unusable. */
export function parseChatUiSpec(serialized: string): Spec | null {
  const json: unknown = (() => {
    try {
      return JSON.parse(serialized);
    } catch {
      return null;
    }
  })();
  if (json === null) return null;
  const parsed = chatUiSpecSchema.safeParse(json);
  if (!parsed.success) return null;
  // A spec whose root is missing renders as an empty box; treat it as unusable
  // so the panel shows its fallback instead of a blank card.
  if (!parsed.data.elements[parsed.data.root]) return null;
  return parsed.data;
}
