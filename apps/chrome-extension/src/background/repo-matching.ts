import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { ConvexHttpClient } from "convex/browser";
import { NoRepoMatchError } from "./convex";

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function findBestMatchingRepo(
  host: string,
  domainToRepoId: Map<string, Id<"githubRepos">>,
): Id<"githubRepos"> | null {
  let bestMatch: { domain: string; repoId: Id<"githubRepos"> } | null = null;
  for (const [domain, repoId] of domainToRepoId) {
    if (
      domainMatches(host, domain) &&
      (!bestMatch || domain.length > bestMatch.domain.length)
    ) {
      bestMatch = { domain, repoId };
    }
  }
  return bestMatch?.repoId ?? null;
}

/**
 * Resolves which repo a page belongs to by matching its host against the
 * `domains` configured on each repo. Throws `NoRepoMatchError` if none match.
 */
export async function resolveRepoForUrl(
  client: ConvexHttpClient,
  pageUrl: string,
): Promise<Id<"githubRepos">> {
  const host = getHostFromUrl(pageUrl);
  if (!host) throw new NoRepoMatchError("Invalid page URL");

  const repos = await client.query(api.githubRepos.list, {});
  const domainToRepoId = new Map<string, Id<"githubRepos">>();
  for (const repo of repos) {
    if (!repo.domains) continue;
    for (const raw of repo.domains) {
      let hostname = raw;
      try {
        const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
        hostname = url.hostname;
      } catch {
      }
      domainToRepoId.set(hostname, repo._id);
    }
  }

  const repoId = findBestMatchingRepo(host, domainToRepoId);
  if (!repoId) throw new NoRepoMatchError("No repo mapped to this domain");
  return repoId;
}
