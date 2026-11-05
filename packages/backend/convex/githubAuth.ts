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

let sharedAppAuth: ReturnType<typeof createAppAuth> | null = null;

/**
 * One `createAppAuth` per process. It caches installation tokens (keyed by
 * installation, permissions and repositories) until shortly before expiry,
 * so repeated calls in a warm action reuse the token instead of minting one.
 */
function appAuth(): ReturnType<typeof createAppAuth> {
  sharedAppAuth ??= createAppAuth(getGitHubCredentials());
  return sharedAppAuth;
}

/** Short-lived access token for a GitHub App installation (cached per process). */
export async function getInstallationToken(
  installationId: number,
): Promise<string> {
  const installationAuth = await appAuth()({
    type: "installation",
    installationId,
  });
  return installationAuth.token;
}

/**
 * Token for exactly one repository in an installation (contents write +
 * metadata read). Used when a sandbox asks for credentials for a repository
 * other than its own: it can clone and push that repository, but cannot reach
 * the rest of the installation or touch PRs, issues or workflows. Scopes by
 * repository id when known; GitHub also accepts the repository name for
 * installations whose id we never recorded.
 */
function siblingRepoInstallationAuth(
  installationId: number,
  repo: { githubId: number | undefined; name: string },
) {
  return appAuth()({
    type: "installation",
    installationId,
    permissions: { contents: "write", metadata: "read" },
    ...(repo.githubId !== undefined
      ? { repositoryIds: [repo.githubId] }
      : { repositoryNames: [repo.name] }),
  });
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

/**
 * A token plus its real GitHub expiry (unix seconds). The process cache above
 * can hand out a token up to 59 minutes old, so callers that cache it again
 * (the sandbox credential helper) must key off `expiresAt`, not fetch time.
 */
const sandboxGitCredentialValidator = v.object({
  token: v.string(),
  expiresAt: v.number(),
});

function toSandboxGitCredential(auth: { token: string; expiresAt: string }) {
  return {
    token: auth.token,
    expiresAt: Math.floor(Date.parse(auth.expiresAt) / 1000),
  };
}

/** Internal action wrapper so HTTP actions can mint an installation token via ctx.runAction. */
export const mintInstallationToken = internalAction({
  args: { installationId: v.number() },
  returns: sandboxGitCredentialValidator,
  handler: async (_ctx, args) => {
    return toSandboxGitCredential(
      await appAuth()({
        type: "installation",
        installationId: args.installationId,
      }),
    );
  },
});

/** Internal action wrapper for the single-repository sibling token. */
export const mintSiblingRepoToken = internalAction({
  args: {
    installationId: v.number(),
    githubId: v.optional(v.number()),
    name: v.string(),
  },
  returns: sandboxGitCredentialValidator,
  handler: async (_ctx, args) => {
    return toSandboxGitCredential(
      await siblingRepoInstallationAuth(args.installationId, {
        githubId: args.githubId,
        name: args.name,
      }),
    );
  },
});
