import type { ActivityStep } from "@eva/ui";

/** One run of the child thread: the subagent's prose, or the tools it ran. */
export type SubagentThreadBlock =
  | { kind: "text"; text: string }
  | { kind: "steps"; steps: ActivityStep[] };

/** A subagent's transcript, read back out of its parent's activity steps. */
export interface SubagentThread {
  /** The prompt it was spawned with (recorded for new runs only). */
  prompt?: string;
  blocks: SubagentThreadBlock[];
  /** The Agent tool result, unless the last block already says it. */
  result?: string;
}

/**
 * Folds the parent's activity steps (in turn order) into one subagent's thread.
 * The `Agent` row (`subtask`, keyed by `toolUseId`) gives the prompt and
 * result; steps tagged with its id as `parentToolUseId` are the body. Its own
 * text arrives as `response` steps (see claudeParseLine); every other step is
 * a tool call, grouped into runs so they render as one activity list.
 *
 * `includeResult` is false for backgrounded agents: their tool result is only
 * the launch notice, and the real report is their last message.
 */
export function buildSubagentThread(
  steps: ReadonlyArray<ActivityStep>,
  toolUseId: string,
  includeResult: boolean,
): SubagentThread {
  let prompt: string | undefined;
  let result: string | undefined;
  const blocks: SubagentThreadBlock[] = [];

  for (const step of steps) {
    if (step.type === "subtask" && step.toolUseId === toolUseId) {
      const spawnPrompt = step.contentPreview?.trim();
      if (spawnPrompt && prompt === undefined) prompt = spawnPrompt;
      const output = step.output?.text.trim();
      if (output) result = output;
      continue;
    }
    if (step.parentToolUseId !== toolUseId) continue;
    if (step.type === "response") {
      const text = step.output?.text.trim();
      if (text) blocks.push({ kind: "text", text });
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === "steps") last.steps.push(step);
    else blocks.push({ kind: "steps", steps: [step] });
  }

  const last = blocks.at(-1);
  const repeatsLastText = last?.kind === "text" && last.text === result;
  return {
    prompt,
    blocks,
    result: includeResult && !repeatsLastText ? result : undefined,
  };
}

/** True when nothing of the thread was recorded (older runs, or not started). */
export function isEmptySubagentThread(thread: SubagentThread): boolean {
  return (
    thread.prompt === undefined &&
    thread.blocks.length === 0 &&
    thread.result === undefined
  );
}
