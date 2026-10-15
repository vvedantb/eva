import {
  buildEditPrompt,
  type ChatRuntimeFacts,
} from "../_sessions/prompts";

interface BuildProjectChatPromptArgs {
  repoOwner: string;
  repoName: string;
  branchName: string;
  title: string;
  description: string | undefined;
  generatedSpec: string | undefined;
  message: string;
  rootDirectory: string;
  customInstructionsBlock: string;
  systemPrompt: string | undefined;
  devPort: number | undefined;
  readableRepos: ReadonlyArray<{ owner: string; name: string }>;
  runtime: ChatRuntimeFacts;
}

/**
 * Builds the prompt for an in-sandbox chat message attached to a project.
 * Matches session edit mode: commit locally when source changes; Eva pushes the
 * project branch after the workflow completes successfully.
 */
export function buildProjectChatPrompt(
  args: BuildProjectChatPromptArgs,
): string {
  const descriptionBlock = args.description
    ? `\nProject description:\n${args.description}`
    : "";

  const messageWithContext = `In the sandbox for project "${args.title}"${descriptionBlock}

${args.message}`;

  return buildEditPrompt({
    repo: { owner: args.repoOwner, name: args.repoName },
    branchName: args.branchName,
    planContent: args.generatedSpec,
    message: messageWithContext,
    rootDirectory: args.rootDirectory,
    customInstructionsBlock: args.customInstructionsBlock,
    systemPrompt: args.systemPrompt,
    devPort: args.devPort,
    readableRepos: args.readableRepos,
    runtime: args.runtime,
  });
}
