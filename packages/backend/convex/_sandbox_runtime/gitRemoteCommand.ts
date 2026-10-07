import { quote } from "shell-quote";

/**
 * Prefix that makes an in-sandbox git network command use the credential
 * helper: drop the GitHub extraheader leftover, point origin at a bare URL,
 * and disable interactive prompts.
 */
export function gitRemoteAuthPrefix(
  workspaceDir: string,
  repoUrl: string,
): string {
  return (
    `cd ${workspaceDir} && ` +
    `git config --unset-all http.https://github.com/.extraheader 2>/dev/null; ` +
    `git remote set-url origin ${quote([repoUrl])} && ` +
    `GIT_TERMINAL_PROMPT=0`
  );
}
