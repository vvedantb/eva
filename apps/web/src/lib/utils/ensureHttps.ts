export function ensureHttps(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "https:") {
      return "about:blank";
    }
    return parsed.toString();
  } catch {
    return "about:blank";
  }
}
