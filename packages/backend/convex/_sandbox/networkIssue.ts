/**
 * True for a transient sandbox/snapshot failure (network error or a 408/429/5xx
 * status) that is worth retrying. Base-branch fetch failures and failed
 * commands inside the sandbox are real errors, not transient ones.
 */
export function isSandboxNetworkIssue(errorMsg: string): boolean {
  const message = errorMsg.toLowerCase();
  if (message.includes("failed to fetch latest base branch")) {
    return false;
  }
  const networkMarkers = [
    "network",
    "fetch failed",
    "econnreset",
    "econnrefused",
    "etimedout",
    "enotfound",
    "getaddrinfo",
    "socket hang up",
    "timeout",
    "timed out",
    "aborted",
  ];
  const sandboxMarkers = ["sandbox", "snapshot"];
  const transientStatusMarkers = [
    "status code 408",
    "status code 429",
    "status code 500",
    "status code 502",
    "status code 503",
    "status code 504",
  ];

  const hasSandboxMarker = sandboxMarkers.some((marker) =>
    message.includes(marker),
  );
  if (!hasSandboxMarker) {
    return false;
  }

  if (
    message.includes("sandbox exec") ||
    message.includes("sandbox command failed")
  ) {
    return false;
  }

  const hasNetworkMarker = networkMarkers.some((marker) =>
    message.includes(marker),
  );
  const hasTransientStatusMarker = transientStatusMarkers.some((marker) =>
    message.includes(marker),
  );

  if (
    message.includes("sandbox failed to become ready within the timeout period")
  ) {
    return true;
  }

  return hasNetworkMarker || hasTransientStatusMarker;
}

// Usage-limit text parsing lives in ./usageLimitReset (pure module shared with
// the web app's recovery card); re-exported here for existing importers.
