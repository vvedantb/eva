/**
 * The one preview failure the user can do something about.
 *
 * When the in-sandbox auth proxy will not start, Preview cannot fall back to
 * the unproxied service port without serving the sandbox with no auth gate, so
 * `getPreviewUrl` fails loudly. Production Convex redacts a plain `Error` to
 * "Server Error", so the port and the reason never reached the user — they saw
 * a blank Preview tab. As a tagged error the message travels on
 * `ConvexError.data` instead.
 *
 * Everything else `getPreviewUrl` does (auth, sandbox access, credentials, the
 * handle, the readiness probe, signing the URL) stays a defect and stays
 * redacted: those are outages or bugs, not answers to the user's request.
 */

import { Data, Effect } from "effect";

export class PreviewProxyFailed extends Data.TaggedError("PreviewProxyFailed")<{
  message: string;
  cause: unknown;
}> {}

/** The exact text Preview has always reported for a proxy that would not start. */
export function previewProxyFailed(
  port: number,
  reason: string,
  cause: unknown,
): PreviewProxyFailed {
  return new PreviewProxyFailed({
    message: `Vercel preview proxy failed to start on port ${port}: ${reason}`,
    cause,
  });
}

/**
 * Runs a preview attempt so that only {@link PreviewProxyFailed} reaches the
 * user. Anything else the attempt throws is re-raised as a defect, which
 * `runActionEffect` rethrows unchanged.
 */
export function visiblePreviewFailure<A>(
  attempt: () => Promise<A>,
): Effect.Effect<A, PreviewProxyFailed> {
  return Effect.tryPromise({ try: attempt, catch: (cause) => cause }).pipe(
    Effect.catchAll((cause) =>
      cause instanceof PreviewProxyFailed
        ? Effect.fail(cause)
        : Effect.die(cause),
    ),
  );
}
