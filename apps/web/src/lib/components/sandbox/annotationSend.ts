import type { Id } from "@eva/backend";
import type { PreviewAnnotation } from "@eva/shared/previewAnnotationDisplay";

/**
 * Preview select-element → chat: compact display text, rich agent prompt, and
 * where it points (stored on the row for the preview comments drawer).
 */
export type AnnotationSubmit = (
  display: string,
  full: string,
  annotation: PreviewAnnotation,
) => Promise<void>;

/**
 * One chat's preview annotation wiring: how to send one, and the chat whose
 * annotations the preview comments drawer lists. `chatId` is undefined for a
 * quick task's or project's chat before its session exists.
 */
export interface PreviewAnnotationTarget {
  submit: AnnotationSubmit;
  chatId: Id<"sessionChats"> | undefined;
}

type AnnotationSubmitPort = (
  display: string,
  full: string,
  annotation: PreviewAnnotation,
) => Promise<void | null>;

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
  enqueue: AnnotationSubmitPort;
  send: AnnotationSubmitPort;
  postError: (content: string) => Promise<void | null>;
}): AnnotationSubmit {
  return async (display, full, annotation) => {
    if (isExecuting) {
      await enqueue(display, full, annotation);
      return;
    }
    await send(display, full, annotation).catch(async (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to send annotation";
      await postError(`Error: ${message}`);
    });
  };
}
