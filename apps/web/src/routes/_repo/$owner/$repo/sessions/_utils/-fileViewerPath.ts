// Path presentation for the File Viewer header. `?file=` always carries the
// absolute sandbox path (that is what the read/write actions take), but the
// breadcrumb and the highlighter both want the repo-relative path: the header
// should read `apps/web/src/App.tsx`, not `/vercel/sandbox/apps/web/…`, and
// `@pierre/diffs` infers the language from the name it is given.

export interface FileBreadcrumbSegment {
  label: string;
  /** True for the last segment, which is the file itself. */
  isFile: boolean;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Trailing slashes make `${root}/` prefix matching double up. */
function normalizeRoot(root: string | null): string | null {
  if (root === null) return null;
  const trimmed = normalizeSlashes(root).replace(/\/+$/, "");
  return trimmed === "" ? null : trimmed;
}

/**
 * The path as it should be shown and handed to the highlighter: relative to the
 * sandbox repo root when the file sits under it, otherwise the absolute path.
 * A file outside the root (say `/tmp/out.log`) keeps its full path — shortening
 * it would claim it lives in the repo.
 */
export function repoRelativeName(absPath: string, root: string | null): string {
  const path = normalizeSlashes(absPath);
  const base = normalizeRoot(root);
  if (base === null) return path;
  const prefix = `${base}/`;
  if (!path.startsWith(prefix)) return path;
  const relative = path.slice(prefix.length);
  return relative === "" ? path : relative;
}

/**
 * Directory segments followed by the file name, for the header breadcrumb.
 * Empty for an empty path so the header can render nothing rather than a dot.
 */
export function fileBreadcrumbSegments(
  absPath: string,
  root: string | null,
): FileBreadcrumbSegment[] {
  const name = repoRelativeName(absPath, root);
  const labels = name.split("/").filter((segment) => segment !== "");
  return labels.map((label, index) => ({
    label,
    isFile: index === labels.length - 1,
  }));
}
