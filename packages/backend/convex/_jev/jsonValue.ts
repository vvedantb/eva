import { z } from "zod";

/**
 * A JSON-compatible value and the zod schema that parses one. Shared by the
 * MCP tool layer (V8 isolate) and the `"use node"` actions, so it lives in a
 * leaf module neither side has to reach across a runtime boundary for.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
