/** Soft-limit so huge doc bodies aren't copied into every hover portal. */
const PREVIEW_SOFT_MAX = 280;

/** Collapse markdown/noise into a short plain-text hover preview. */
export function sidebarTextPreview(
  text: string | undefined | null,
): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length <= PREVIEW_SOFT_MAX) return cleaned;
  return `${cleaned.slice(0, PREVIEW_SOFT_MAX - 1)}…`;
}
