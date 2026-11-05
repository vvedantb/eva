/** Preview select-element → chat: compact display text + rich agent prompt. */
export type AnnotationSubmit = (display: string, full: string) => Promise<void>;

/**
 * The one send rule every sandbox chat (session, quick task, project) uses
 * for a preview annotation; each surface only supplies its own mutations.
 * - A running turn: queue `full`, shown in chat as `display`.
 * - Idle: post `display` as the user row and start a turn with `full`. A
 *   failure lands in the chat as an assistant error row.
 */
export function annotationSender({
  isExecuting,
  enqueue,
  send,
  postError,
}: {
  isExecuting: boolean;
  enqueue: (display: string, full: string) => Promise<void | null>;
  send: (display: string, full: string) => Promise<void | null>;
  postError: (content: string) => Promise<void | null>;
}): AnnotationSubmit {
  return async (display, full) => {
    if (isExecuting) {
      await enqueue(display, full);
      return;
    }
    await send(display, full).catch(async (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to send annotation";
      await postError(`Error: ${message}`);
    });
  };
}
