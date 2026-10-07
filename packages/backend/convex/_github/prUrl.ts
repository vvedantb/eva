/** Extracts the PR number from a GitHub pull request URL. */
export function extractPrNumber(prUrl: string): number | null {
  const match = prUrl.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Alias kept for inbound webhook / archive call sites. */
export const extractPrNumberFromUrl = extractPrNumber;
