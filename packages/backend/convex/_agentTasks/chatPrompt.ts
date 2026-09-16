import { buildEditPrompt } from "../_sessions/prompts";

interface BuildAgentTaskChatPromptArgs {
  repoOwner: string;
  repoName: string;
  branchName: string;
  title: string;
  description: string | undefined;
  tags: string[] | undefined;
  taskNumber: number | undefined;
  status: string;
  message: string;
  rootDirectory: string;
  customInstructionsBlock: string;
  systemPrompt: string | undefined;
  devPort: number | undefined;
  readableRepos: ReadonlyArray<{ owner: string; name: string }>;
}

/**
 * Builds the prompt for an in-sandbox chat message attached to an agent task.
 * Matches session edit mode: commit locally when source changes; Eva pushes the
 * task branch after the workflow completes successfully.
 */
export function buildAgentTaskChatPrompt(
  args: BuildAgentTaskChatPromptArgs,
): string {
  const numberLabel = args.taskNumber ? `#${args.taskNumber} ` : "";
  const descriptionBlock = args.description
    ? `\nTask description:\n${args.description}`
    : "";
  const tagsLine =
    args.tags && args.tags.length > 0 ? `\nTags: ${args.tags.join(", ")}` : "";

  const messageWithContext = `In the sandbox for task ${numberLabel}"${args.title}" (status: ${args.status})${tagsLine}${descriptionBlock}

${args.message}`;

  return buildEditPrompt(
    { owner: args.repoOwner, name: args.repoName },
    args.branchName,
    args.description ?? "",
    messageWithContext,
    args.rootDirectory,
    args.customInstructionsBlock,
    args.systemPrompt,
    args.devPort,
    [],
    args.readableRepos,
  );
}
