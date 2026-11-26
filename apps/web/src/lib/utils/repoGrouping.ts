import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";

/** A single repo row from `githubRepos.list` (root repo or a monorepo app). */
export type RepoWithLogo = FunctionReturnType<
  typeof api.githubRepos.list
>[number];

// Shared with the phone app's chat header (its repo tile and label).
export { appLeafName, repoDisplayLabel } from "@eva/shared";

/** Matches a monorepo app row to the URL `appName` segment. */
export function appMatchesLabel(app: RepoWithLogo, appName: string): boolean {
  const leaf = app.rootDirectory?.split("/").pop();
  return leaf === appName || app.rootDirectory === appName;
}
