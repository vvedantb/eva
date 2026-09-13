export type PublicConvexUrlEnv = {
  EVA_PUBLIC_CONVEX_URL?: string;
  EVA_PUBLIC_CONVEX_SITE_URL?: string;
  CONVEX_CLOUD_URL?: string;
  CONVEX_SITE_URL?: string;
};

/** Customer Convex deployments Eva's MCP tools may call with a deploy key. */
const CUSTOMER_CONVEX_CLOUD_HOST = /^[a-z0-9-]+\.convex\.cloud$/i;

/**
 * Rejects repo-configured Convex URLs that would send a deploy key off-platform
 * (SSRF / credential exfil). Eva's own tunnel overrides are not passed through
 * this helper — only customer env values from getRepoConvexCredentials.
 */
export function assertAllowedCustomerConvexUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Convex URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Convex URL must use https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Convex URL must not include credentials");
  }
  if (!CUSTOMER_CONVEX_CLOUD_HOST.test(parsed.hostname)) {
    throw new Error("Convex URL host is not allowed");
  }
  return parsed.origin;
}

/**
 * Fetch target for Convex test-query / admin APIs. Eva's own cloud URL
 * (including tunnel overrides) is allowed; anything else must be a customer
 * Convex Cloud host so a deploy key cannot be sent off-platform.
 */
export function assertSafeConvexFetchUrl(
  url: string,
  evaCloudUrl: string,
): string {
  const strip = (value: string) => value.replace(/\/$/, "");
  if (strip(url) === strip(evaCloudUrl)) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid Convex URL");
    }
    if (parsed.username || parsed.password) {
      throw new Error("Convex URL must not include credentials");
    }
    return strip(evaCloudUrl);
  }
  return assertAllowedCustomerConvexUrl(url);
}

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
