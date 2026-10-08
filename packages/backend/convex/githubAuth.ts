"use node";

import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  ensurePkcs8PrivateKey,
  normalizePemKey,
} from "./githubPrivateKeyFormat";

export { normalizePemKey } from "./githubPrivateKeyFormat";

/** Builds an authenticated GitHub clone URL using an access token. */
export function buildGitHubRepoUrl(
  owner: string,
  repo: string,
  token: string,
): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

/** Builds a base64-encoded authorization header for git HTTP operations. */
export function buildGitHubExtraHeader(token: string): string {
  return `AUTHORIZATION: basic ${Buffer.from(
    `x-access-token:${token}`,
  ).toString("base64")}`;
}

/** Reads GitHub App credentials from environment variables. */
export function getGitHubCredentials() {
  const appId = process.env.GITHUB_APP_ID;
  const rawKey = process.env.GITHUB_PRIVATE_KEY;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!appId || !rawKey) {
    throw new Error("GitHub App credentials not configured");
  }
  return {
    appId,
    privateKey: ensurePkcs8PrivateKey(normalizePemKey(rawKey)),
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
  };
}

/** Generates a short-lived access token for a GitHub App installation. */
export async function getInstallationToken(
  installationId: number,
): Promise<string> {
  const creds = getGitHubCredentials();
  const auth = createAppAuth(creds);
  const installationAuth = await auth({
    type: "installation",
    installationId,
  });
  return installationAuth.token;
}

/**
 * Read-only token for exactly one repository in an installation (contents +
 * metadata read). Used when a sandbox asks for credentials for a repository
 * other than its own, so the token cannot write and cannot reach the rest of
 * the installation. Scopes by repository id when known; GitHub also accepts the
 * repository name for installations whose id we never recorded.
 */
export async function getReadOnlyRepoInstallationToken(
  installationId: number,
  repo: { githubId: number | undefined; name: string },
): Promise<string> {
  const creds = getGitHubCredentials();
  const auth = createAppAuth(creds);
  const installationAuth = await auth({
    type: "installation",
    installationId,
    permissions: { contents: "read", metadata: "read" },
    ...(repo.githubId !== undefined
      ? { repositoryIds: [repo.githubId] }
      : { repositoryNames: [repo.name] }),
  });
  return installationAuth.token;
}

/** Creates an Octokit client authenticated as a specific GitHub App installation. */
export async function getInstallationOctokit(
  installationId: number,
): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}

/** Creates an Octokit client authenticated as the GitHub App itself (not an installation). */
export function getAppOctokit(): Octokit {
  const creds = getGitHubCredentials();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: creds,
  });
}

/** Internal action wrapper so HTTP actions can mint an installation token via ctx.runAction. */
export const mintInstallationToken = internalAction({
  args: { installationId: v.number() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return await getInstallationToken(args.installationId);
  },
});

/** Internal action wrapper for the single-repository read-only token. */
export const mintReadOnlyRepoToken = internalAction({
  args: {
    installationId: v.number(),
    githubId: v.optional(v.number()),
    name: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    return await getReadOnlyRepoInstallationToken(args.installationId, {
      githubId: args.githubId,
      name: args.name,
    });
  },
});
