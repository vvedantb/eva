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
    "await ctx.storage.delete(storageId);",
  );
  expect(deleteRowAt).toBeGreaterThan(-1);
  expect(
    deleteBlobsAt,
    "remove must reclaim attachmentStorageIds, or the blobs leak",
  ).toBeGreaterThan(-1);
  expect(queuedMessagesSource).toContain(
    "for (const storageId of queuedMessage.attachmentStorageIds ?? [])",
  );
});

/**
 * The other half of the invariant: dequeuing deletes the queued row too, but it
 * hands the same storage ids to the `messages` row, so it must NOT delete the
 * blobs. The row-delete now lives once in the shared dequeue
 * (`startNextQueuedChatMessage`) that all three surfaces call through, so a
 * regression back to a per-surface copy (or a dropped delete) would move this
 * count away from exactly one.
 */
test("the shared dequeue deletes the queued row exactly once, and never a blob", () => {
  const rowDeletes = countOccurrences(
    queueHelpersSource,
    "await ctx.db.delete(nextMessage._id);",
  );
  expect(
    rowDeletes,
    "the queued-row delete moved, was duplicated, or was dropped",
  ).toBe(1);
  expect(
    queueHelpersSource,
    "dequeue must not delete blobs the messages row now owns",
  ).not.toContain("ctx.storage.delete");
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

/** One `const name: SomeConfig<...> = {...}` object literal, ending on the `\n};` that closes it. */
function configBody(source: string, name: string): string {
  const startAt = source.indexOf(`const ${name}:`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n};", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}
