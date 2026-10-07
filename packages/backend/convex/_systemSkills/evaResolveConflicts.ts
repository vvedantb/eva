import type { SystemSkillHydration } from "./registry";

/**
 * Content served by the `get_skill` MCP tool for `eva-resolve-conflicts`. The
 * user's own prompt, kept short; only the repo's base branch is filled in.
 */
export function buildEvaResolveConflictsContent({
  baseBranch,
}: SystemSkillHydration): string {
  return `# eva-resolve-conflicts

get us up to date with origin/${baseBranch} and resolve conflicts pls
`;
}
