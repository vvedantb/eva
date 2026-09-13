/** True for http(s) URLs only — blocks javascript: / data: markdown media. */
export function isSafeMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://eva.invalid");
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
