import { EVA_MENTION_ID } from "./chatMessageRoute";
import { tokenizedToDisplayText } from "./mentionText";

const THREAD_PREVIEW_WORDS = 6;

/**
 * The first words of a thread's root message as plain text, with "…" when
 * cut: mention tokens read as `@Name`, and markdown `*`, code ticks and
 * line markers (`#`, `>`, `-`) drop out.
 */
export function threadRootPreview(content: string): string {
  const words = tokenizedToDisplayText(content)
    .replace(/^[\s#>*-]+/gm, "")
    .replace(/[*`]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const shown = words.slice(0, THREAD_PREVIEW_WORDS).join(" ");
  return words.length > THREAD_PREVIEW_WORDS ? `${shown}…` : shown;
}

/** The line over the coordinator chat's composer while Eva's turn answers in a thread; the root's preview follows. */
export function threadTurnStatusText(hasQuestion: boolean): string {
  return hasQuestion ? "Eva has a question in a thread on" : "Eva is replying in a thread on";
}

/**
 * A non-blocking question to answer in a thread: the one Eva's turn there is
 * streaming, else one saved on the thread's last reply. A turn in the main
 * chat (`isTurnThread` false) never puts its streamed question here.
 */
export function threadPendingQuestion(params: {
  isTurnThread: boolean;
  streamingQuestion: string | undefined;
  replies: ReadonlyArray<{ role: string; pendingQuestion?: string }>;
}): string | undefined {
  if (params.isTurnThread && params.streamingQuestion) return params.streamingQuestion;
  const last = params.replies[params.replies.length - 1];
  return last?.role === "assistant" && last.pendingQuestion ? last.pendingQuestion : undefined;
}

/** An answer posted in a thread @mentions Eva, so it wakes her there (a reply alone does not). */
export function threadAnswerContent(answer: string): string {
  return `@[Eva](${EVA_MENTION_ID}) ${answer}`;
}
