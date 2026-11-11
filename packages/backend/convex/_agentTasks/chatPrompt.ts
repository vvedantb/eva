import {
  buildEditPrompt,
  type ChatRuntimeFacts,
} from "../_sessions/prompts";
import { withTaskContext } from "../_sessions/sessionPrompt";

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
  runtime: ChatRuntimeFacts;
}

/**
 * Builds the prompt for an in-sandbox chat message attached to an agent task.
 * Matches session edit mode: commit locally when source changes; Eva pushes the
 * task branch after the workflow completes successfully.
 */
export function buildAgentTaskChatPrompt(
  args: BuildAgentTaskChatPromptArgs,
): string {
  const messageWithContext = withTaskContext(args, args.message);

  return buildEditPrompt({
    repo: { owner: args.repoOwner, name: args.repoName },
    branchName: args.branchName,
    planContent: args.description ?? "",
    message: messageWithContext,
    rootDirectory: args.rootDirectory,
    customInstructionsBlock: args.customInstructionsBlock,
    systemPrompt: args.systemPrompt,
    devPort: args.devPort,
    readableRepos: args.readableRepos,
    runtime: args.runtime,
  });
}
