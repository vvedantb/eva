import { buildEditPrompt } from "../_sessions/prompts";

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

  return buildEditPrompt(
    { owner: args.repoOwner, name: args.repoName },
    args.branchName,
    args.generatedSpec ?? "",
    messageWithContext,
    args.rootDirectory,
    args.customInstructionsBlock,
    args.systemPrompt,
    args.devPort,
    [],
    args.readableRepos,
  );
}
