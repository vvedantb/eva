import { PREVIEW_GRANT_PARAM } from "../previewGrantConfig";

/** Shared sticky Preview path helpers for sessions, tasks, projects. */

/** Normalize a Preview path to always start with `/` and never store a grant. */
export function normalizeStickyPreviewPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  try {
    const parsed = new URL(withSlash, "https://eva.invalid");
    parsed.searchParams.delete(PREVIEW_GRANT_PARAM);
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return withSlash;
  }
}

/** Valid TCP port for Preview sticky `devPort`. */
export function assertStickyPreviewPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid port");
  }
}
