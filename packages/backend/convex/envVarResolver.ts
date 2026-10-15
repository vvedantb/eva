"use node";

import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { decryptCredentialMap } from "./_envVars/encryptedEntries";
import {
  sandboxEligibleEnvVars,
  type EnvVarEntry,
} from "./_envVars/documentStore";
import { getAIModelProvider } from "./validators";
import type { SandboxCredentials } from "./_sandbox/provider";
import {
  presentEnv,
  selectVercelCredentials,
  type VercelCredentialSelection,
} from "./_envVars/vercelCredentials";
import {
  pickSnapshotCredentialRepoId,
  type AppRepoPickFields,
} from "./_githubRepos/sandboxRepoPick";

/**
 * Loads team + repo env vars, keeps the entries `pick` returns from each
 * source, and decrypts them. Repo vars override team vars.
 */
async function loadMergedEnvVars(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  pick: (vars: EnvVarEntry[]) => Array<{ key: string; value: string }>,
): Promise<Record<string, string>> {
  const teamId = await ctx.runQuery(internal.githubRepos.getTeamIdForRepo, {
    repoId,
  });
  const teamVars = teamId
    ? await ctx.runQuery(internal.teamEnvVars.getAllInternal, { teamId })
    : [];
  const repoVars = await ctx.runQuery(internal.repoEnvVars.getAllInternal, {
    repoId,
  });
  return {
    ...decryptCredentialMap(pick(teamVars)),
    ...decryptCredentialMap(pick(repoVars)),
  };
}

/** Resolves and decrypts all env vars (team + repo), including sandbox-excluded ones. Repo vars override team vars. */
export async function resolveAllEnvVars(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Record<string, string>> {
  return loadMergedEnvVars(ctx, repoId, (vars) => vars);
}

/** Resolves and decrypts sandbox-eligible env vars (team + repo). Repo vars override team vars. */
export async function resolveEnvVars(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Record<string, string>> {
  return loadMergedEnvVars(ctx, repoId, sandboxEligibleEnvVars);
}

/** All repos in the same codebase (owner/name), requested repo first. */
async function listMonorepoRepoIds(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Array<Id<"githubRepos">>> {
  const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
    id: repoId,
  });
  if (!repo) return [repoId];
  const siblingIds = await ctx.runQuery(
    internal.githubRepos.listRepoIdsByOwnerAndName,
    { owner: repo.owner, name: repo.name },
  );
  if (siblingIds.length === 0) return [repoId];
  return [repoId, ...siblingIds.filter((id) => id !== repoId)];
}

async function loadSiblingRepoFields(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<Array<AppRepoPickFields & { _id: Id<"githubRepos"> }>> {
  const repoIds = await listMonorepoRepoIds(ctx, repoId);
  const docs: Array<AppRepoPickFields & { _id: Id<"githubRepos"> }> = [];
  for (const id of repoIds) {
    const doc = await ctx.runQuery(internal.githubRepos.getInternal, { id });
    if (doc) docs.push(doc);
  }
  return docs;
}

/**
 * Collects Vercel token/team from the target repo and monorepo siblings, but
 * VERCEL_PROJECT_ID only from the target (or the root's picked app). Sibling
 * apps often share token + team via team env vars, while each app has its own
 * Vercel project — borrowing a sibling app's project id creates sandboxes
 * under the wrong app.
 */
async function selectVercelCredentialsForRepo(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<{
  credentialRepoId: Id<"githubRepos">;
  selected: VercelCredentialSelection;
}> {
  let credentialRepoId = repoId;
  let targetVars = await resolveAllEnvVars(ctx, repoId);

  if (!presentEnv(targetVars.VERCEL_PROJECT_ID)) {
    const siblings = await loadSiblingRepoFields(ctx, repoId);
    credentialRepoId = await pickSnapshotCredentialRepoId(
      repoId,
      siblings,
      async (id) => {
        if (id === repoId) return false;
        const vars = await resolveAllEnvVars(ctx, id);
        return presentEnv(vars.VERCEL_PROJECT_ID) !== undefined;
      },
    );
    if (credentialRepoId !== repoId) {
      targetVars = await resolveAllEnvVars(ctx, credentialRepoId);
    }
  }

  const siblingVarsList: Array<Record<string, string>> = [];
  if (
    !presentEnv(targetVars.VERCEL_TOKEN) ||
    !presentEnv(targetVars.VERCEL_TEAM_ID)
  ) {
    const repoIds = await listMonorepoRepoIds(ctx, credentialRepoId);
    for (const siblingId of repoIds) {
      if (siblingId === credentialRepoId) continue;
      siblingVarsList.push(await resolveAllEnvVars(ctx, siblingId));
    }
  }

  return {
    credentialRepoId,
    selected: selectVercelCredentials(targetVars, siblingVarsList),
  };
}

function toVercelCredentials(
  selected: Extract<VercelCredentialSelection, { ok: true }>,
): Extract<SandboxCredentials, { kind: "vercel" }> {
  return {
    kind: "vercel",
    token: selected.token,
    teamId: selected.teamId,
    projectId: selected.projectId,
  };
}

/**
 * Same as resolveSandboxCredentials, but missing Vercel env is a returned
 * error instead of a throw (so snapshot create does not log Uncaught Error).
 */
export async function tryResolveSandboxCredentials(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<
  | {
      ok: true;
      credentials: SandboxCredentials;
      sandboxEnvVars: Record<string, string>;
    }
  | { ok: false; error: string }
> {
  const { credentialRepoId, selected } = await selectVercelCredentialsForRepo(
    ctx,
    repoId,
  );
  if (!selected.ok) {
    return { ok: false, error: selected.message };
  }
  const sandboxEnvVars = await resolveEnvVars(ctx, credentialRepoId);
  return {
    ok: true,
    credentials: toVercelCredentials(selected),
    sandboxEnvVars,
  };
}

/**
 * Resolves the sandbox provider credentials (no full sandbox env map). Used
 * by kickoff/thaw paths that only need to call the provider SDK. Vercel is
 * the only provider, so this always resolves Vercel credentials.
 */
export async function resolveSandboxCredentialsOnly(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<SandboxCredentials> {
  const { selected } = await selectVercelCredentialsForRepo(ctx, repoId);
  if (!selected.ok) {
    throw new Error(selected.message);
  }
  return toVercelCredentials(selected);
}

/**
 * Resolves the sandbox provider credentials for a repo, alongside the
 * sandbox-eligible env vars passed into the sandbox.
 *
 * `VERCEL_PROJECT_ID` always comes from the target app repo so eprocurement
 * never creates sandboxes under apps/web's Vercel project.
 */
export async function resolveSandboxCredentials(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<{
  credentials: SandboxCredentials;
  sandboxEnvVars: Record<string, string>;
}> {
  const resolved = await tryResolveSandboxCredentials(ctx, repoId);
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  return {
    credentials: resolved.credentials,
    sandboxEnvVars: resolved.sandboxEnvVars,
  };
}

/**
 * Resolves the decrypted credential env vars for an entity owner's selected
 * provider account, used to override the shared team credential at launch.
 *
 * Explicit selections fail closed when the account is unavailable or does not
 * match the model. Silently falling back would attribute a turn to one account
 * while actually spending another account's quota.
 */
export async function resolveProviderAccountCredentials(
  ctx: GenericActionCtx<DataModel>,
  accountId: Id<"userProviderAccounts">,
  ownerUserId: Id<"users">,
  model: string | undefined,
): Promise<Record<string, string>> {
  const account = await ctx.runQuery(
    internal.userProviderAccounts.getForLaunchInternal,
    { accountId, ownerUserId },
  );
  if (!account) {
    throw new Error("Selected provider account is no longer available");
  }
  const modelProvider = getAIModelProvider(model);
  if (account.provider !== modelProvider) {
    throw new Error("Selected provider account does not support this model");
  }
  // Bookkeeping only — never let it break a launch that has its credentials.
  try {
    await ctx.runMutation(internal.userProviderAccounts.recordUsageInternal, {
      accountId,
      userId: ownerUserId,
    });
  } catch (error) {
    console.warn(
      `[env] resolveProviderAccountCredentials: could not record usage of account ${accountId}`,
      error,
    );
  }
  return decryptCredentialMap(account.credentials);
}

/**
 * Returns the credential revision used in a warm daemon's identity. Updating
 * credentials on the same account id therefore rotates the daemon too.
 */
export async function resolveProviderAccountCredentialRevision(
  ctx: GenericActionCtx<DataModel>,
  accountId: Id<"userProviderAccounts">,
  ownerUserId: Id<"users">,
  model: string | undefined,
): Promise<number> {
  const account = await ctx.runQuery(
    internal.userProviderAccounts.getForLaunchInternal,
    { accountId, ownerUserId },
  );
  if (!account) {
    throw new Error("Selected provider account is no longer available");
  }
  if (account.provider !== getAIModelProvider(model)) {
    throw new Error("Selected provider account does not support this model");
  }
  return account.updatedAt;
}
