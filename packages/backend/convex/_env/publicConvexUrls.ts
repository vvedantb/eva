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
