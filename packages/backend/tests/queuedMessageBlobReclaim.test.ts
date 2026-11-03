import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const queuedMessagesSource = readFileSync(
  join(testsDir, "../convex/queuedMessages.ts"),
  "utf8",
);

const queueHelpersSource = readFileSync(
  join(testsDir, "../convex/_queues/helpers.ts"),
  "utf8",
);

const attachmentsSource = readFileSync(
  join(testsDir, "../convex/_queues/attachments.ts"),
  "utf8",
);

/**
 * A queued message's attachments are uploaded for that message alone, so
 * deleting the row without deleting the blobs leaks them into `_storage`
 * forever with nothing referencing them.
 */
test("queuedMessages.remove deletes the row's attachment blobs", () => {
  const deleteRowAt = queuedMessagesSource.indexOf(
    "await ctx.db.delete(args.id);",
  );
  const deleteBlobsAt = queuedMessagesSource.indexOf(
    "await reclaimQueuedAttachments(ctx, queuedMessage);",
  );
  expect(deleteRowAt).toBeGreaterThan(-1);
  expect(
    deleteBlobsAt,
    "remove must reclaim attachmentStorageIds, or the blobs leak",
  ).toBeGreaterThan(-1);
  expect(attachmentsSource).toContain(
    "for (const storageId of queuedMessage.attachmentStorageIds ?? [])",
  );
});

/**
 * The other half of the invariant: dequeuing deletes the queued row too, but it
 * hands the same storage ids to the `messages` row, so it must NOT delete the
 * blobs. The row-delete lives only in the shared dequeue
 * (`startNextQueuedChatMessage`) that all three surfaces call through: once on
 * the start path, and once where an unresolvable provider account consumes the
 * message with an error bubble (264df6080). A regression back to a per-surface
 * copy (or a dropped delete) would move these counts.
 */
test("the shared dequeue deletes the queued row exactly once per path, and never a blob", () => {
  const rowDelete = "await ctx.db.delete(nextMessage._id);";
  const dequeue = functionBody(
    queueHelpersSource,
    "async function startNextQueuedChatMessage<",
  );
  expect(
    countOccurrences(dequeue, rowDelete),
    "the queued-row delete moved, was duplicated, or was dropped",
  ).toBe(2);
  expect(
    countOccurrences(queueHelpersSource, rowDelete),
    "the queued-row delete was copied out of the shared dequeue",
  ).toBe(2);
  expect(
    queueHelpersSource,
    "dequeue must not delete blobs the messages row now owns",
  ).not.toContain("ctx.storage.delete");
  // The two paths that consume the row WITHOUT inserting the user message
  // (unresolvable account, failed guard) reclaim the uploads; the start path,
  // which hands them to the messages row, must not.
  expect(
    countOccurrences(dequeue, "await reclaimQueuedAttachments(ctx, nextMessage);"),
    "a failure path stopped reclaiming its uploads, or the start path began to",
  ).toBe(2);
  const startPath = dequeue.slice(dequeue.indexOf("if (!guard.ok)"));
  const afterGuard = startPath.slice(startPath.indexOf("\n  }\n") + 4);
  expect(afterGuard).not.toContain("reclaimQueuedAttachments");
});

/**
 * Each surface's own `insertUserMessage` closure still builds its own message
 * shape (fields differ per surface), so the attachment hand-off is checked
 * once per config rather than once per (now-shared) dequeue.
 */
test.each([
  "sessionChatQueueConfig",
  "projectChatQueueConfig",
  "taskChatQueueConfig",
])(
  "%s hands attachmentStorageIds to the messages row instead of dropping them",
  (name) => {
    const body = configBody(queueHelpersSource, name);
    expect(
      body,
      `${name} must copy attachmentStorageIds onto the messages row`,
    ).toContain("attachmentStorageIds: next.attachmentStorageIds,");
  },
);

function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

/** A top-level function, ending on the `\n}\n` that closes it. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}\n", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One `const name: SomeConfig<...> = {...}` object literal, ending on the `\n};` that closes it. */
function configBody(source: string, name: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n};", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}
