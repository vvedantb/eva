/**
 * Any env map, `process.env` included. Reads EVA_PUBLIC_CONVEX_URL,
 * EVA_PUBLIC_CONVEX_SITE_URL, CONVEX_CLOUD_URL and CONVEX_SITE_URL. A map, not
 * an all-optional object: TypeScript's weak-type check rejects a
 * `process.env` whose type declares other keys (Expo's NODE_ENV).
 */
export type PublicConvexUrlEnv = Readonly<Record<string, string | undefined>>;

/** Cloud URL sandboxes / external callers should use (tunnel override wins). */
export function resolvePublicConvexCloudUrl(
  env: PublicConvexUrlEnv,
): string | undefined {
  const url = env.EVA_PUBLIC_CONVEX_URL ?? env.CONVEX_CLOUD_URL;
  return url ? url : undefined;
}

/**
 * HTTP-actions site URL. Prefer an explicit site override, otherwise rewrite
 * the public cloud URL (`.convex.cloud` → `.convex.site`).
 */
export function resolvePublicConvexSiteUrl(
  env: PublicConvexUrlEnv,
  fallbackCloudUrl?: string,
): string | undefined {
  const configured = env.EVA_PUBLIC_CONVEX_SITE_URL ?? env.CONVEX_SITE_URL;
  if (configured) return configured;
  const cloud = fallbackCloudUrl ?? resolvePublicConvexCloudUrl(env);
  if (!cloud) return undefined;
  return cloud.replace(".convex.cloud", ".convex.site");
}

/** Convex Cloud API hosts, e.g. `happy-animal-123.convex.cloud` or a regional `….eu-west-1.convex.cloud`. */
const CONVEX_CLOUD_HOST = /^([a-z0-9-]+\.)+convex\.cloud$/;

/**
 * Origin of a repo-configured Convex URL, or a thrown error. Eva sends the
 * repo's deploy key to this URL, so it must be an https Convex Cloud host:
 * anything else would hand the key to whoever controls the host.
 */
export function customerConvexOrigin(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Convex URL is not a valid URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !CONVEX_CLOUD_HOST.test(parsed.hostname)
  ) {
    throw new Error(
      "Convex URL must be an https://<deployment>.convex.cloud URL",
    );
  }
  return parsed.origin;
}
