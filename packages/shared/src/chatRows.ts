import type { PrState } from "./prState";
import { isSandboxPausedAlert } from "./sandboxStopReason";

const SANDBOX_LIFECYCLE_ALERTS = new Set(["Sandbox started", "Sandbox stopped", "Sandbox reconnected"]);

/** A sandbox start, stop, reconnect or idle-pause row: never drawn, as it repeats on every VM cycle. */
export function isSandboxLifecycleAlert(message: { isSystemAlert?: boolean; content: string }): boolean {
  return (
    message.isSystemAlert === true &&
    (SANDBOX_LIFECYCLE_ALERTS.has(message.content) ||
      isSandboxPausedAlert(message.content))
  );
}

/**
 * The rows a transcript draws. Simple view omits every system alert; sandbox
 * start, stop and reconnect rows are always hidden. The rows stay in Convex:
 * this only affects rendering, the empty state and last-message targeting.
 * The same array comes back when nothing is hidden.
 */
export function visibleChatMessages<M extends { isSystemAlert?: boolean; content: string }>(
  messages: M[],
  hideSystemAlerts: boolean,
): M[] {
  const hidden = (message: M) => isSandboxLifecycleAlert(message) || (hideSystemAlerts && message.isSystemAlert === true);
  if (!messages.some(hidden)) return messages;
  return messages.filter((message) => !hidden(message));
}

/**
 * Answered AskUserQuestion prompts, as a read-only record for the transcript.
 * A still-active question is excluded: the composer dock shows it live, so a
 * card for it would be the same prompt twice.
 */
export function collectQuestionSteps<S extends QuestionStepLike>(steps: S[]): S[] {
  return steps.filter(isAnsweredQuestionStep);
}

type QuestionStepLike = { type: string; status: string; questions?: readonly unknown[] };

function isAnsweredQuestionStep(step: QuestionStepLike): boolean {
  return step.type === "question" && step.status === "complete" && step.questions !== undefined && step.questions.length > 0;
}

/** A run of trace steps, then the answered question asked right after it (`null` on the last run). */
export interface QuestionSplitChunk<S> {
  steps: S[];
  question: S | null;
}

/**
 * Cuts a turn's steps at each answered question, so the question record sits
 * where it was asked instead of under the whole trace. Always one chunk or more.
 */
export function splitStepsAtQuestions<S extends QuestionStepLike>(steps: S[]): QuestionSplitChunk<S>[] {
  const chunks: QuestionSplitChunk<S>[] = [];
  let run: S[] = [];
  for (const step of steps) {
    if (isAnsweredQuestionStep(step)) {
      chunks.push({ steps: run, question: step });
      run = [];
    } else {
      run.push(step);
    }
  }
  chunks.push({ steps: run, question: null });
  return chunks;
}

/**
 * Banner copy for an archived session. A merged or closed PR names the reason
 * the session locked (reopening it on GitHub unlocks again); a live session
 * has none.
 */
export function getSessionReadOnlyMessage(args: { isArchived: boolean; prState: PrState | undefined }): string | undefined {
  if (!args.isArchived) return undefined;
  if (args.prState === "merged") return "This PR has been merged, so this session is now read-only.";
  if (args.prState === "closed") return "This PR has been closed, so this session is now read-only.";
  return "This session is archived and read-only";
}
