"use node";

import type { Octokit } from "octokit";
import { z } from "zod";
import { decodeGitHubContent } from "../_repoSkills/decodeGitHubContent";
import { getAppOctokit, getInstallationOctokit } from "../githubAuth";

/** Octokit throws RequestError, which carries the HTTP status as a property. */
const requestErrorSchema = z.object({ status: z.number() });

const NOT_IN_INSTALLATION = "Repository is not part of this GitHub installation";

/**
 * GitHub's own id, owner and name for `owner/name`. Throws unless the repo is
 * part of `installationId`. Asks the App which installation holds the repo,
 * because an installation token can also read public repos outside it.
 */
export async function resolveInstallationRepo(
  installationId: number,
  owner: string,
  name: string,
): Promise<{ githubId: number; owner: string; name: string }> {
  const lookup = async () => {
    const octokit = await getInstallationOctokit(installationId);
    return await Promise.all([
      getAppOctokit().rest.apps.getRepoInstallation({ owner, repo: name }),
      octokit.rest.repos.get({ owner, repo: name }),
    ]);
  };
  const [{ data: installation }, { data: repo }] = await lookup().catch(
    (error) => {
      const parsed = requestErrorSchema.safeParse(error);
      if (parsed.success && parsed.data.status === 404) {
        throw new Error(NOT_IN_INSTALLATION, { cause: error });
      }
      throw error;
    },
  );
  if (installation.id !== installationId) {
    throw new Error(NOT_IN_INSTALLATION);
  }
  return { githubId: repo.id, owner: repo.owner.login, name: repo.name };
}

const packageJsonSchema = z.object({
  scripts: z.object({ dev: z.string() }).partial().optional(),
});

export { extractPrNumber } from "./prUrl";

/** Scans the apps/ directory of a repo to detect monorepo sub-applications. */
export async function detectAppsForRepo(
  octokit: Octokit,
  owner: string,
  name: string,
): Promise<Array<{ name: string; path: string; hasDevScript: boolean }>> {
  const apps: Array<{ name: string; path: string; hasDevScript: boolean }> = [];

  try {
    const { data: entries } = await octokit.rest.repos.getContent({
      owner,
      repo: name,
      path: "apps",
    });

    if (!Array.isArray(entries)) return [];

    for (const entry of entries) {
      if (entry.type !== "dir") continue;
      const appPath = `apps/${entry.name}`;
      let hasDevScript = false;
      try {
        const { data: appPkg } = await octokit.rest.repos.getContent({
          owner,
          repo: name,
          path: `${appPath}/package.json`,
        });
        if ("content" in appPkg) {
          const decoded = decodeGitHubContent(appPkg.content);
          const parsed = packageJsonSchema.safeParse(JSON.parse(decoded));
          hasDevScript = typeof parsed.data?.scripts?.dev === "string";
        }
      } catch {
        // no package.json in this app dir
      }
      apps.push({ name: entry.name, path: appPath, hasDevScript });
    }
  } catch {
    // apps/ directory doesn't exist — not a monorepo with apps
  }

  return apps;
}
