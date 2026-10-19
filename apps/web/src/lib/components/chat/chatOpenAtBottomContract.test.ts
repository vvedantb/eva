import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const chatBody = read(join(here, "ChatBody.tsx"));
const conversation = read(
  join(here, "../../../../../../packages/ui/src/ai-elements/conversation.tsx"),
);

/**
 * Regression (fix #987): opening a chat animated the scroller from the top
 * down to the last turn. The shared `<Conversation>` defaults to
 * `resize="smooth"`, so every growth after mount — skeleton to transcript,
 * the deferred backlog, late markdown — glided instead of snapping. ChatBody
 * now asks for a smooth resize only while a reply streams. Dropping the prop
 * silently brings the bug back, and nothing renders StickToBottom in tests.
 */
function conversationOpenTag(source: string): string {
  const start = source.indexOf("<Conversation\n");
  expect(start, "ChatBody no longer renders <Conversation>").toBeGreaterThan(
    -1,
  );
  return source.slice(start, source.indexOf("<ConversationContent", start));
}

test("the chat scroller only glides while a reply streams", () => {
  const tag = conversationOpenTag(chatBody);
  expect(tag).toMatch(/resize=\{streamingTargetId \? "smooth" : "instant"\}/);
});

test("the chat scroller lands at the bottom on first paint", () => {
  const tag = conversationOpenTag(chatBody);
  // ChatBody inherits `initial` from the shared component; an override to
  // smooth would replay the top-down scroll on every open.
  expect(tag).not.toMatch(/\binitial=/);
  expect(conversation).toContain('initial="instant"');
});

function read(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}
