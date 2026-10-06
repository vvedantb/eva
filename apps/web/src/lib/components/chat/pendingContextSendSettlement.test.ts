import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function sourceOf(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8");
}

const SEND_HANDLERS = [
  [
    "session",
    "../../../routes/_repo/$owner/$repo/sessions/_components/useSessionSend.ts",
  ],
  ["task", "../tasks/TaskSandboxChatPanel.tsx"],
  ["project", "../projects/ProjectSandboxChatPanel.tsx"],
] as const;

/**
 * A send that fails used to look like a send that worked: the session handler
 * fired `void Promise.all([...])` and the task/project handlers swallowed the
 * throw in a `try/catch`, so ChatBody's `await onSend(...)` always resolved and
 * ate the user's pending citation / snapshot / WebMCP chips. The failure toast
 * then restored the prompt it was handed — which, for a ChatBody send, is the
 * text with the context blocks already appended to it.
 *
 * The contract is asserted on the source because it lives in closures inside a
 * component tree; there is no exported function to call (same reason as
 * hiddenShellQueries.test.ts).
 */
describe("chat sends report settlement honestly", () => {
  test("ChatBody observes settlement instead of awaiting it", () => {
    const source = sourceOf("ChatBody.tsx");
    // Awaiting would hold the typed text on screen until the mutation
    // round-trips: the composer only clears once the submit promise resolves.
    expect(source).not.toContain("await onSend(withWebMcp");
    expect(source).toContain("void onSend(withWebMcp, attachmentStorageIds, {");
    // The pre-append text is what a failed send must hand back.
    expect(source).toContain("draftContent: content,");
  });

  test("ChatBody drops the sent chips only on the fulfilled branch", () => {
    const source = sourceOf("ChatBody.tsx");
    const settled = source.slice(
      source.indexOf("void onSend(withWebMcp"),
      source.indexOf("const hasComposerContext"),
    );
    // Two handlers, both `() => {` at the same indent: the second one is the
    // rejection handler.
    const rejectedAt = settled.lastIndexOf("      () => {\n");
    const onFulfilled = settled.slice(0, rejectedAt);
    expect(onFulfilled).toContain("citations?.remove(citation.id)");
    expect(onFulfilled).toContain("snapshots?.remove(item.id)");
    expect(onFulfilled).toContain("webmcp?.remove(item.id)");
    // Nothing is removed once the send has rejected.
    const onRejected = settled.slice(rejectedAt);
    expect(onRejected).not.toContain("remove(");
  });

  for (const [surface, path] of SEND_HANDLERS) {
    test(`the ${surface} send rejects on failure and restores the typed text`, () => {
      const source = sourceOf(path);
      // Never fired and forgotten: the caller cannot tell a delivered send from
      // a failed one unless the promise settles with the mutations.
      expect(source).not.toContain("void Promise.all(");
      expect(source).toContain(
        "const draftContent = options?.draftContent ?? content;",
      );
      expect(source).toContain("content: draftContent,");
      // Both failure paths (enqueue and start-execution) toast and rethrow.
      expect(source.match(/raiseSendFailure\(\n/g) ?? []).toHaveLength(2);
      expect(source.match(/throw error;/g) ?? []).toHaveLength(2);
    });
  }
});
