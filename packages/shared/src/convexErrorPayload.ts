import { z } from "zod";

/**
 * The structured payload a backend action puts on `ConvexError.data` when an
 * Effect pipeline fails with a tagged error.
 *
 * Production Convex redacts plain `Error` messages to "Server Error"; only
 * `ConvexError` data crosses the wire. `tag` is the error's `_tag` (renamed
 * because Convex object fields cannot start with an underscore) so the web can
 * branch on the kind of failure instead of matching message text.
 */
export const convexErrorPayloadSchema = z.object({
  tag: z.string().min(1),
  message: z.string(),
});

export type ConvexErrorPayload = z.infer<typeof convexErrorPayloadSchema>;
