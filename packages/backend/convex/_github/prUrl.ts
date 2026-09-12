import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

const PR_URL_PATTERN =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

/** Parses a pasted GitHub pull request URL into owner/name/number. */
export function parseGithubPrUrl(input: string): {
  owner: string;
  name: string;
  number: number;
  canonical: string;
} | null {
  const match = PR_URL_PATTERN.exec(input.trim());
  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  const number = Number(match[3]);
  if (owner === undefined || name === undefined || !Number.isFinite(number)) {
    return null;
  }
  return {
    owner,
    name,
    number,
    canonical: `https://github.com/${owner}/${name}/pull/${number}`,
  };
}

/** Rejects PR URLs that do not belong to this Eva repository. */
export async function assertPrUrlForRepo(
  db: GenericDatabaseReader<DataModel>,
  repoId: Id<"githubRepos">,
  prUrl: string,
): Promise<string> {
  const parsed = parseGithubPrUrl(prUrl);
  if (!parsed) throw new Error("Invalid pull request URL");
  const repo = await db.get(repoId);
  if (!repo) throw new Error("Repository not found");
  if (
    repo.owner.toLowerCase() !== parsed.owner.toLowerCase() ||
    repo.name.toLowerCase() !== parsed.name.toLowerCase()
  ) {
    throw new Error("Pull request is not for this repository");
  }
  return parsed.canonical;
}
