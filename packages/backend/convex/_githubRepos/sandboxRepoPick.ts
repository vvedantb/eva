/** Fields `pickDefaultVisibleAppRepo` / sandbox credential picking read. */
export type AppRepoPickFields = {
  rootDirectory?: string;
  hidden?: boolean;
  connectedBy?: string;
};

/** Default visible monorepo app row for bare owner/name URLs and external links. */
export function pickDefaultVisibleAppRepo<T extends AppRepoPickFields>(
  siblings: Array<T>,
): T | undefined {
  const visible = siblings.filter(
    (repo) => repo.rootDirectory !== undefined && repo.hidden !== true,
  );
  const webApp = visible.find(
    (repo) =>
      repo.rootDirectory === "web" || repo.rootDirectory?.endsWith("/web"),
  );
  if (webApp) return webApp;

  const connected = visible.find((repo) => repo.connectedBy !== undefined);
  if (connected) return connected;

  return visible[0];
}

/**
 * Pure credential-repo picker (testable).
 * 1. Workflow repo if it already has VERCEL_PROJECT_ID (keep app-scoped runs).
 * 2. Default visible app (usually apps/web) when it has the key.
 * 3. Any other sibling app with the key.
 * 4. Preferred app / workflow repo as last resort (caller surfaces missing creds).
 */
export async function pickSandboxRepoId<TId extends string>(
  workflowRepoId: TId,
  siblings: Array<AppRepoPickFields & { _id: TId }>,
  hasVercelProjectId: (repoId: TId) => Promise<boolean>,
): Promise<TId> {
  if (await hasVercelProjectId(workflowRepoId)) {
    return workflowRepoId;
  }

  const preferred = pickDefaultVisibleAppRepo(siblings);
  if (preferred && (await hasVercelProjectId(preferred._id))) {
    return preferred._id;
  }

  for (const sibling of siblings) {
    if (sibling._id === workflowRepoId) continue;
    if (sibling.rootDirectory === undefined) continue;
    if (await hasVercelProjectId(sibling._id)) {
      return sibling._id;
    }
  }

  return preferred?._id ?? workflowRepoId;
}

/**
 * Snapshot builds must not silently use a sibling *app's* Vercel project
 * (eprocurement must not capture under apps/web). The monorepo root has no
 * project id of its own, so it may pick the default app that does.
 */
export async function pickSnapshotCredentialRepoId<TId extends string>(
  workflowRepoId: TId,
  siblings: Array<AppRepoPickFields & { _id: TId }>,
  hasVercelProjectId: (repoId: TId) => Promise<boolean>,
): Promise<TId> {
  if (await hasVercelProjectId(workflowRepoId)) {
    return workflowRepoId;
  }
  const workflow = siblings.find((repo) => repo._id === workflowRepoId);
  if (workflow?.rootDirectory !== undefined) {
    return workflowRepoId;
  }
  return pickSandboxRepoId(workflowRepoId, siblings, hasVercelProjectId);
}
