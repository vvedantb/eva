import { ConvexError } from "convex/values";
import { Data, Effect } from "effect";
import { describe, expect, test, vi } from "vitest";
import { convexErrorPayloadSchema } from "@eva/shared/convexErrorPayload";
import {
  runActionEffect,
  UnexpectedActionFailure,
} from "../convex/_effect/action";

class DocNotFound extends Data.TaggedError("DocNotFound")<{
  message: string;
}> {}

/** Silences the runner's log line while still letting a test read it. */
function captureErrorLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("runActionEffect", () => {
  test("hands back the success value untouched", async () => {
    const value = { url: "https://github.com/eva/eva/pull/1" };
    await expect(runActionEffect(Effect.succeed(value), "pilot")).resolves.toBe(
      value,
    );
  });

  /**
   * The whole point of the runner: production Convex redacts a thrown `Error`
   * to "Server Error", so an expected outcome has to arrive as `ConvexError`
   * data shaped like the contract the web parses.
   */
  test("a tagged failure crosses as ConvexError data", async () => {
    const log = captureErrorLog();
    try {
      await expect(
        runActionEffect(
          Effect.fail(new DocNotFound({ message: "Doc not found" })),
          "docs.get doc=42",
        ),
      ).rejects.toBeInstanceOf(ConvexError);

      const error = await runActionEffect(
        Effect.fail(new DocNotFound({ message: "Doc not found" })),
        "docs.get doc=42",
      ).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ConvexError);
      const payload = convexErrorPayloadSchema.parse(
        error instanceof ConvexError ? error.data : undefined,
      );
      expect(payload).toEqual({ tag: "DocNotFound", message: "Doc not found" });
    } finally {
      log.mockRestore();
    }
  });

  test("logs the tag and message under the label before rethrowing", async () => {
    const log = captureErrorLog();
    try {
      await runActionEffect(
        Effect.fail(new DocNotFound({ message: "Doc not found" })),
        "docs.get doc=42",
      ).catch(() => undefined);
      expect(log).toHaveBeenCalledWith(
        "[docs.get doc=42] DocNotFound: Doc not found",
      );
    } finally {
      log.mockRestore();
    }
  });

  /**
   * A defect is a bug, not a user-facing outcome. It is rethrown as the very
   * object that was thrown, so Convex still redacts it — and so a caller that
   * asks `instanceof` questions about it still gets an answer.
   */
  test("a defect is rethrown unchanged", async () => {
    const defect = new TypeError("cannot read properties of undefined");
    await expect(runActionEffect(Effect.die(defect), "pilot")).rejects.toBe(
      defect,
    );
  });

  test("a non-Error defect is rethrown unchanged too", async () => {
    const defect = { boom: true };
    await expect(runActionEffect(Effect.die(defect), "pilot")).rejects.toBe(
      defect,
    );
  });

  test("a defect is never wrapped in ConvexError", async () => {
    const thrown = await runActionEffect(
      Effect.die(new TypeError("bug")),
      "pilot",
    ).catch((error: unknown) => error);
    expect(thrown).not.toBeInstanceOf(ConvexError);
  });

  test("an interrupt rejects without becoming a visible failure", async () => {
    const thrown = await runActionEffect(Effect.interrupt, "pilot").catch(
      (error: unknown) => error,
    );
    expect(thrown).not.toBeInstanceOf(ConvexError);
  });
});

describe("UnexpectedActionFailure", () => {
  test("is a tagged, message-carrying Error that keeps its cause", () => {
    const cause = new Error("Not authenticated");
    const failure = new UnexpectedActionFailure({
      message: cause.message,
      cause,
    });
    expect(failure._tag).toBe("UnexpectedActionFailure");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe("Not authenticated");
    expect(failure.cause).toBe(cause);
  });

  test("crosses the wire with its own tag", async () => {
    const log = captureErrorLog();
    try {
      const thrown = await runActionEffect(
        Effect.fail(
          new UnexpectedActionFailure({
            message: "Not authenticated",
            cause: undefined,
          }),
        ),
        "pr createTaskPr task=abc",
      ).catch((error: unknown) => error);
      const payload = convexErrorPayloadSchema.parse(
        thrown instanceof ConvexError ? thrown.data : undefined,
      );
      expect(payload).toEqual({
        tag: "UnexpectedActionFailure",
        message: "Not authenticated",
      });
    } finally {
      log.mockRestore();
    }
  });
});
