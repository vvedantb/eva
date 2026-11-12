/**
 * Public chat composers may only write the caller's own user turn. The one
 * exception is the send-failure bubble the web posts when a send throws
 * (`annotationSend.ts`: `role: "assistant"`, content `Error: …`). Anything
 * else would let a repo member forge an agent reply in a teammate's chat.
 */
export function assertComposerMessageRole(args: {
  role: "user" | "assistant";
  content: string;
}): void {
  if (args.role === "user") return;
  if (args.content.startsWith("Error: ")) return;
  throw new Error("Only user messages can be posted to this chat");
}
