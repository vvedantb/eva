/** One `pulls.listFiles` entry — the fields we need to rebuild a diff section. */
export type PrListFile = {
  filename: string;
  previous_filename?: string;
  status: string;
  patch?: string;
};

/**
 * GitHub refuses `pulls.get` with the diff media type past ~300 files (HTTP 406,
 * `code: too_large`). Message matching survives Convex wrapping the HttpError.
 */
export function isPrDiffTooLargeError(error: Error): boolean {
  return (
    error.message.includes('"code":"too_large"') ||
    error.message.includes("diff exceeded the maximum number of files") ||
    error.message.includes("diff exceeded the maximum number of lines")
  );
}

/**
 * Rebuild one file's unified-diff section from a `pulls.listFiles` entry so
 * `buildDiffFileEntries` / `@pierre/diffs` can parse the same shape as the
 * media-type endpoint.
 */
export function listFileToUnifiedDiff(file: PrListFile): string {
  const oldPath = file.previous_filename ?? file.filename;
  const lines: string[] = [`diff --git a/${oldPath} b/${file.filename}`];

  if (file.status === "added") {
    lines.push("new file mode 100644");
    lines.push("--- /dev/null");
    lines.push(`+++ b/${file.filename}`);
  } else if (file.status === "removed") {
    lines.push("deleted file mode 100644");
    lines.push(`--- a/${oldPath}`);
    lines.push("+++ /dev/null");
  } else if (file.status === "renamed") {
    lines.push(`rename from ${oldPath}`);
    lines.push(`rename to ${file.filename}`);
    lines.push(`--- a/${oldPath}`);
    lines.push(`+++ b/${file.filename}`);
  } else {
    lines.push(`--- a/${oldPath}`);
    lines.push(`+++ b/${file.filename}`);
  }

  if (file.patch !== undefined && file.patch.length > 0) {
    lines.push(file.patch);
  } else {
    lines.push(`Binary files a/${oldPath} and b/${file.filename} differ`);
  }

  return lines.join("\n");
}
