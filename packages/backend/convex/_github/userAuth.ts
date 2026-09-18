"use node";

import { v } from "convex/values";
import { App, Octokit } from "octokit";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { decryptValue, encryptValue } from "../encryption";
import { getGitHubCredentials } from "../githubAuth";
import { GITHUB_AUTH_REQUIRED } from "./authErrors";
import { classifyGitHubFailure } from "./githubErrors";

/** Refresh once the access token is this close to expiring. */
const EXPIRY_SKEW_MS = 60 * 1000;

// Octokit omits `expiresAt` when the App has user-token expiry switched off. The
// token then lasts until revoked, so park the stored expiry far enough out that
// the refresh path never triggers for it.
const NON_EXPIRING_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/** Shown when the installation really is not this caller's to inspect. */
export const INSTALLATION_NOT_AUTHORIZED =
  "Not authorized to inspect this installation";

/**
 * Shown when GitHub throttled the lookup. Deliberately says nothing about
 * authorization: the web decides whether to offer the authorize hop by matching
 * {@link GITHUB_AUTH_REQUIRED} in the message, and a retryable outcome must not
 * read as a credentials problem.
 */
export const GITHUB_RATE_LIMITED =
  "GitHub rate limit reached — try again in a minute";

/**
 * What a refused installation-repositories lookup means to the caller.
 *
 * Throttling is not an access verdict — the credentials are fine and the same
 * call works once the window resets — so it is kept apart from the 403/404 that
 * really do mean "this installation is not yours".
 */
export function classifyInstallationReposFailure(
  error: unknown,
): "rate-limited" | "not-authorized" | "rethrow" {
  switch (classifyGitHubFailure(error)._tag) {
    case "GitHubRateLimited":
      return "rate-limited";
    case "GitHubForbidden":
    case "GitHubNotFound":
      return "not-authorized";
    default:
      return "rethrow";
  }
}

interface ResolvedToken {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string | null;
  refreshTokenExpiresAt: number | null;
}

/**
 * The OAuth client for this GitHub App's user-authorization flow.
 *
 * Octokit owns the token endpoint: it signs requests with the client secret and
 * raises GitHub's OAuth failures, which arrive as HTTP 200 with an error body
 * rather than as an error status.
 *
 * Reached through `App` rather than the top-level `OAuthApp` export because that
 * export is typed for OAuth Apps, whose tokens never expire; `App.oauth` is the
 * GitHub-App-flavoured client, so `createToken` reports expiry and refresh.
 */
function getOAuthApp() {
  const { appId, privateKey, clientId, clientSecret } = getGitHubCredentials();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in Convex env",
    );
  }
  return new App({ appId, privateKey, oauth: { clientId, clientSecret } })
    .oauth;
}

/** Parses an ISO expiry, refusing anything that would store as NaN. */
function parseExpiry(iso: string): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new Error(`GitHub returned an unreadable token expiry: ${iso}`);
  }
  return parsed;
}

/** Converts Octokit's ISO expiry strings into the epoch millis we store. */
function toResolvedToken(authentication: {
  token: string;
  expiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
}): ResolvedToken {
  return {
    accessToken: authentication.token,
    accessTokenExpiresAt:
      authentication.expiresAt === undefined
        ? Date.now() + NON_EXPIRING_MS
        : parseExpiry(authentication.expiresAt),
    refreshToken: authentication.refreshToken ?? null,
    refreshTokenExpiresAt:
      authentication.refreshTokenExpiresAt === undefined
        ? null
        : parseExpiry(authentication.refreshTokenExpiresAt),
  };
}

/** Persists a token set for a user, encrypting both secrets at rest. */
async function storeToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  token: ResolvedToken,
): Promise<void> {
  await ctx.runMutation(internal._github.userTokens.putStoredToken, {
    userId,
    accessToken: encryptValue(token.accessToken),
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshToken:
      token.refreshToken === null ? null : encryptValue(token.refreshToken),
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
  });
}

/**
 * Trades an authorization code for a user token and stores it.
 *
 * Called from the OAuth callback, where the caller's identity comes from the
 * redeemed state nonce rather than from Convex auth.
 */
export async function exchangeCodeForUserToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  code: string,
): Promise<void> {
  const { authentication } = await getOAuthApp().createToken({ code });
  await storeToken(ctx, userId, toResolvedToken(authentication));
}

/**
 * Node-side half of the OAuth callback, which runs in the isolate.
 *
 * Internal-only, and it trusts `userId`: the http action establishes it by
 * redeeming the single-use state nonce, and nothing else may call this.
 */
export const completeUserAuthorization = internalAction({
  args: { userId: v.id("users"), code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await exchangeCodeForUserToken(ctx, args.userId, args.code);
    return null;
  },
});

/**
 * The caller's usable GitHub access token in plaintext, or null when they have
 * not authorized Eva (or their authorization has lapsed beyond refresh).
 */
async function resolveUserAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<string | null> {
  const stored = await ctx.runQuery(
    internal._github.userTokens.getStoredToken,
    { userId },
  );
  if (!stored) return null;

  const now = Date.now();
  if (stored.accessTokenExpiresAt - EXPIRY_SKEW_MS > now) {
    return decryptValue(stored.accessToken);
  }

  if (
    !stored.refreshToken ||
    (stored.refreshTokenExpiresAt ?? 0) - EXPIRY_SKEW_MS <= now
  ) {
    return null;
  }

  const { authentication } = await getOAuthApp().refreshToken({
    refreshToken: decryptValue(stored.refreshToken),
  });
  const refreshed = toResolvedToken(authentication);
  await storeToken(ctx, userId, refreshed);
  return refreshed.accessToken;
}

export interface InstallationRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  url: string;
}

/**
 * The repositories the *caller* can see inside an installation, proving they
 * belong to it.
 *
 * This is the check a client-supplied `installationId` cannot substitute for:
 * GitHub resolves the installation against the user's own token, so an id the
 * caller has no claim to comes back as 403/404 rather than as somebody else's
 * repository list. Never swap this for an installation token — that
 * authenticates as the App, which can read every installation it is part of.
 */
export async function listInstallationReposForUser(
  ctx: ActionCtx,
  userId: Id<"users">,
  installationId: number,
): Promise<InstallationRepo[]> {
  const accessToken = await resolveUserAccessToken(ctx, userId);
  if (!accessToken) {
    throw new Error(GITHUB_AUTH_REQUIRED);
  }
  const octokit = new Octokit({ auth: accessToken });
  const repos = await octokit
    .paginate(octokit.rest.apps.listInstallationReposForAuthenticatedUser, {
      installation_id: installationId,
      per_page: 100,
    })
    .catch((error: unknown) => {
      switch (classifyInstallationReposFailure(error)) {
        case "rate-limited":
          throw new Error(GITHUB_RATE_LIMITED);
        case "not-authorized":
          throw new Error(INSTALLATION_NOT_AUTHORIZED);
        case "rethrow":
          throw error;
      }
    });
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    url: repo.html_url,
  }));
}

/**
 * Throws unless the caller can see `owner/name` inside `installationId`.
 *
 * Guards the write path: binding an Eva repo row to an installation grants the
 * ability to mint installation tokens for it, so the caller has to prove
 * GitHub-side access to that specific repository first.
 */
export async function assertUserCanUseRepo(
  ctx: ActionCtx,
  userId: Id<"users">,
  installationId: number,
  owner: string,
  name: string,
): Promise<InstallationRepo> {
  const repos = await listInstallationReposForUser(ctx, userId, installationId);
  const match = repos.find(
    (repo) =>
      repo.owner.toLowerCase() === owner.toLowerCase() &&
      repo.name.toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    throw new Error("Not authorized to add this repository");
  }
  return match;
}
