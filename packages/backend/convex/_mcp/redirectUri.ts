const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const CURSOR_CALLBACK = "cursor://anysphere.cursor-mcp/oauth/callback";

/** Whether a redirect URI is safe to accept during dynamic client registration. */
export function isAllowedOAuthRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") {
    return LOOPBACK_HOSTS.has(parsed.hostname);
  }
  return parsed.toString() === CURSOR_CALLBACK;
}

/** Canonical form for comparing redirect URIs during authorize / token exchange. */
export function normalizeOAuthRedirectUri(uri: string): string {
  return new URL(uri).toString();
}

export function redirectUriMatchesRegistered(
  redirectUri: string,
  registeredUris: string[],
): boolean {
  if (registeredUris.length === 0) return false;

  let normalized: string;
  try {
    normalized = normalizeOAuthRedirectUri(redirectUri);
  } catch {
    return false;
  }

  for (const registered of registeredUris) {
    try {
      if (normalizeOAuthRedirectUri(registered) === normalized) {
        return true;
      }
    } catch {
      // Skip invalid stored URIs
    }
  }

  return false;
}
