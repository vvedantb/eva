/**
 * Computes Vercel sandbox tags from caller-supplied labels.
 *
 * Vercel allows at most 5 tags per sandbox. Auto-tagging runs only when
 * `ENVIRONMENT` is set on the Convex deployment; otherwise caller labels
 * pass through unchanged (pre-tagging behaviour).
 */

export const SANDBOX_TAG = {
  managed: "eva.managed",
  env: "eva.env",
  deployment: "eva.deployment",
  purpose: "eva.purpose",
  repoId: "eva.repoId",
} as const;

const MAX_SANDBOX_TAGS = 5;

/** Preferred order when trimming past the 5-tag Vercel limit. */
const TAG_PRIORITY: ReadonlyArray<string> = [
  SANDBOX_TAG.managed,
  SANDBOX_TAG.env,
  SANDBOX_TAG.purpose,
  SANDBOX_TAG.repoId,
  SANDBOX_TAG.deployment,
];

/**
 * Slug from CONVEX_CLOUD_URL (e.g. `elegant-snail-639` from
 * `https://elegant-snail-639.convex.cloud`). Always available in Convex.
 */
export function resolveConvexDeploymentSlug(): string | null {
  const url = process.env.CONVEX_CLOUD_URL;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const slug = host.split(".")[0]?.trim();
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * The other Convex deployment that owns this sandbox, or null when it is ours
 * or untagged. The prod-to-dev sync copies prod's Vercel credentials and
 * session rows, so dev can reach prod VMs: it must never stop, exec in or
 * delete one.
 */
export function foreignSandboxDeployment(
  tags: Record<string, string> | undefined,
): string | null {
  const owner = tags?.[SANDBOX_TAG.deployment];
  if (!owner) return null;
  const own = resolveConvexDeploymentSlug();
  return own !== null && owner !== own ? owner : null;
}

/**
 * General deployment environment (`development` / `production` / …).
 * Set `ENVIRONMENT` per Convex deployment. Undefined when unset.
 */
export function resolveEnvironment(): string | undefined {
  const value = process.env.ENVIRONMENT?.trim().toLowerCase();
  if (!value) return undefined;
  return value.slice(0, 64);
}

/**
 * Builds the final label/tag map for sandbox create.
 *
 * When `ENVIRONMENT` is unset: return caller labels only (same as before
 * auto-tagging). When set: stamp Eva defaults and merge caller overrides.
 */
export function buildSandboxLabels(args: {
  ephemeral?: boolean;
  labels?: Record<string, string>;
  repoId?: string;
}): Record<string, string> | undefined {
  const environment = resolveEnvironment();
  if (environment === undefined) {
    return args.labels;
  }

  const defaults: Record<string, string> = {
    [SANDBOX_TAG.managed]: "true",
    [SANDBOX_TAG.env]: environment,
    [SANDBOX_TAG.purpose]: args.ephemeral === true ? "ephemeral" : "persistent",
  };

  const deployment = resolveConvexDeploymentSlug();
  if (deployment) {
    defaults[SANDBOX_TAG.deployment] = deployment;
  }
  if (args.repoId && args.repoId.length > 0) {
    defaults[SANDBOX_TAG.repoId] = args.repoId;
  }

  const merged: Record<string, string> = { ...defaults, ...args.labels };
  return capSandboxTags(merged);
}

/** Keeps at most 5 tags, preferring Eva's standard keys. */
function capSandboxTags(tags: Record<string, string>): Record<string, string> {
  const entries = Object.entries(tags).filter(
    ([key, value]) => key.length > 0 && value.length > 0,
  );
  if (entries.length <= MAX_SANDBOX_TAGS) {
    return Object.fromEntries(entries);
  }

  const out: Record<string, string> = {};
  const remaining = new Map(entries);

  for (const key of TAG_PRIORITY) {
    const value = remaining.get(key);
    if (value === undefined) continue;
    out[key] = value;
    remaining.delete(key);
    if (Object.keys(out).length >= MAX_SANDBOX_TAGS) {
      return out;
    }
  }

  for (const [key, value] of remaining) {
    out[key] = value;
    if (Object.keys(out).length >= MAX_SANDBOX_TAGS) break;
  }
  return out;
}
