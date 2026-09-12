import type { GitStatus } from "@pierre/trees";

/** Splits a multi-file git diff into one self-contained patch string per file. */
function splitDiffFiles(diff: string): string[] {
  if (diff.trim().length === 0) return [];
  return diff
    .split(/\n(?=diff --git )/)
    .map((section) => section.trim())
    .filter((section) => section.startsWith("diff --git "));
}

/** Reads the (new) file path from a single-file git patch, for a stable key. */
function fileNameFromPatch(patch: string, fallback: string): string {
  const match = patch.match(/^diff --git a\/.+? b\/(.+)$/m);
  return match ? match[1] : fallback;
}

/**
 * Classifies a single-file git patch into a git status the file tree can colour.
 * Reads the patch's extended header lines (new/deleted/rename) rather than
 * counting +/- lines, so it mirrors git's own semantics; anything else is a
 * plain content change ("modified").
 */
function diffFileStatus(patch: string): GitStatus {
  if (/^new file mode /m.test(patch)) return "added";
  if (/^deleted file mode /m.test(patch)) return "deleted";
  if (/^rename (from|to) /m.test(patch)) return "renamed";
  return "modified";
}

/** Reads the old path from a rename patch, so headers can show `old → new`. */
function renamedFromPatch(patch: string): string | null {
  const match = patch.match(/^rename from (.+)$/m);
  return match ? match[1] : null;
}

/**
 * Counts changed lines the way GitHub's file header does: `+`/`-` content
 * lines only, excluding the `+++`/`---` file markers of the patch header.
 * Context lines and hunk count come from the same pass — they are only used to
 * estimate a file's rendered height before it is mounted.
 */
function diffFileStats(patch: string): {
  additions: number;
  deletions: number;
  contextLines: number;
  hunkCount: number;
} {
  let additions = 0;
  let deletions = 0;
  let contextLines = 0;
  let hunkCount = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@ ")) hunkCount += 1;
    else if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    // Context lines only exist inside hunks, so the leading-space test is only
    // meaningful once a hunk header has been seen.
    else if (hunkCount > 0 && line.startsWith(" ")) contextLines += 1;
  }
  return { additions, deletions, contextLines, hunkCount };
}

/** One changed file, with everything the header and body need to render it. */
export interface DiffFileEntry {
  /** Self-contained single-file patch. */
  readonly patch: string;
  /** The file's (new) path — also the accordion/tree key. */
  readonly path: string;
  readonly status: GitStatus;
  readonly additions: number;
  readonly deletions: number;
  /** Unchanged lines carried as hunk context — for height estimation only. */
  readonly contextLines: number;
  /** Number of `@@` hunks — each renders one separator row. */
  readonly hunkCount: number;
  /** Old path when the file was renamed or moved. */
  readonly renamedFrom: string | null;
  /** GitHub does not render binary contents, and neither can we. */
  readonly binary: boolean;
  /**
   * False for patches with no `@@` hunks — pure renames, mode changes, and
   * empty new files. There is nothing to diff, so the body says so instead of
   * rendering an empty code view.
   */
  readonly hasHunks: boolean;
}

/**
 * Turns a multi-file diff into the per-file entries the Diffs tab renders.
 * Everything here is derived from the patch text, so a single pass over the
 * diff gives the tree, the headers, and the totals.
 *
 * Paths are unique: the first patch for a path wins. `@pierre/trees` throws
 * `Duplicate path` when the same path is appended twice, and the Review pane is
 * always mounted (just hidden), so one repeated path would take down the whole
 * sandbox route. A repeat is not a legal git diff, but it does reach us — the
 * `pulls.listFiles` fallback for 300+ file PRs can repeat an entry across pages,
 * and a path is also the React key for each accordion item and scroll ref.
 */
export function buildDiffFileEntries(diff: string): DiffFileEntry[] {
  const seenPaths = new Set<string>();
  return splitDiffFiles(diff).flatMap((patch, index) => {
    const stats = diffFileStats(patch);
    const path = fileNameFromPatch(patch, `file-${index}`);
    if (seenPaths.has(path)) return [];
    seenPaths.add(path);
    return {
      patch,
      path,
      status: diffFileStatus(patch),
      additions: stats.additions,
      deletions: stats.deletions,
      contextLines: stats.contextLines,
      hunkCount: stats.hunkCount,
      renamedFrom: renamedFromPatch(patch),
      binary:
        /^GIT binary patch/m.test(patch) ||
        /^Binary files .* differ$/m.test(patch),
      hasHunks: /^@@ /m.test(patch),
    };
  });
}

/** Collapse whitespace so `foo  bar` and `foo bar` compare equal. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, "");
}

function isMinusLine(line: string): boolean {
  return line.startsWith("-") && !line.startsWith("---");
}

function isPlusLine(line: string): boolean {
  return line.startsWith("+") && !line.startsWith("+++");
}

/**
 * Pair deleted/added lines that differ only by whitespace and turn those
 * pairs into context. Unmatched +/- lines stay as real changes — the same
 * idea as `git diff --ignore-all-space`, applied to an already-fetched
 * unified patch so the GitHub PR payload does not need a second fetch.
 */
function filterHunkLines(lines: string[]): {
  lines: string[];
  hasChanges: boolean;
} {
  const out: string[] = [];
  let hasChanges = false;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (!isMinusLine(line) && !isPlusLine(line)) {
      out.push(line);
      index += 1;
      continue;
    }
    const minus: string[] = [];
    const plus: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (current === undefined || !isMinusLine(current)) break;
      minus.push(current);
      index += 1;
    }
    while (index < lines.length) {
      const current = lines[index];
      if (current === undefined || !isPlusLine(current)) break;
      plus.push(current);
      index += 1;
    }
    const usedPlus = new Set<number>();
    for (const removed of minus) {
      const normalized = collapseWhitespace(removed.slice(1));
      const matchAt = plus.findIndex(
        (added, plusIndex) =>
          !usedPlus.has(plusIndex) &&
          collapseWhitespace(added.slice(1)) === normalized,
      );
      if (matchAt >= 0) {
        usedPlus.add(matchAt);
        const kept = plus[matchAt];
        out.push(` ${kept ? kept.slice(1) : removed.slice(1)}`);
        continue;
      }
      out.push(removed);
      hasChanges = true;
    }
    for (const [plusIndex, added] of plus.entries()) {
      if (usedPlus.has(plusIndex)) continue;
      out.push(added);
      hasChanges = true;
    }
  }
  return { lines: out, hasChanges };
}

/**
 * Re-emit a unified patch with whitespace-only edits dropped. Binary patches
 * and header-only files are left alone.
 */
export function ignoreWhitespaceInPatch(patch: string): string {
  if (
    /^GIT binary patch/m.test(patch) ||
    /^Binary files .* differ$/m.test(patch)
  ) {
    return patch;
  }
  const lines = patch.split("\n");
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (!line.startsWith("@@ ")) {
      out.push(line);
      index += 1;
      continue;
    }
    const header = line;
    index += 1;
    const hunk: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (current === undefined) break;
      if (current.startsWith("@@ ") || current.startsWith("diff --git ")) {
        break;
      }
      hunk.push(current);
      index += 1;
    }
    const filtered = filterHunkLines(hunk);
    if (!filtered.hasChanges) continue;
    out.push(header);
    out.push(...filtered.lines);
  }
  return out.join("\n");
}

/** Apply ignore-whitespace to each file entry and recompute header stats. */
export function applyIgnoreWhitespace(
  entries: ReadonlyArray<DiffFileEntry>,
): DiffFileEntry[] {
  return entries.flatMap((entry) => {
    if (entry.binary || !entry.hasHunks) return [entry];
    const next = buildDiffFileEntries(ignoreWhitespaceInPatch(entry.patch));
    return next.length > 0 ? next : [entry];
  });
}
