/**
 * Splits a unified diff into the hunks Jev judges one at a time.
 *
 * Per hunk rather than per diff because the motivating case is a single stray
 * change — an icon swap in a file that was legitimately edited — which a
 * whole-diff question drowns in the surrounding legitimate work.
 *
 * Runtime-free so every parsing edge (deletions, binaries, lockfiles, renames
 * with no hunks) is testable without a deployment.
 */

export interface DiffHunk {
  /** Repo-relative path of the file the hunk touches. */
  file: string;
  /** The hunk's `@@ -a,b +c,d @@ context` line, trimmed. */
  header: string;
  /** The hunk's lines, `\n`-joined, clipped to {@link MAX_HUNK_CHARS}. */
  body: string;
}

/**
 * Generated files no prompt ever asks for by name. Judging them would flag
 * every turn that installed a dependency it was told to install.
 */
export const IGNORED_FILE_NAMES: ReadonlySet<string> = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "Cargo.lock",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
]);

/**
 * Generated output no prompt asks for by name: build artefacts checked in for
 * the runtime (the sandbox callback bundle, Convex codegen). Their hunks are
 * minified walls of text that time Jev out, and judging them would flag every
 * turn that rebuilt them.
 */
export const IGNORED_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /\.generated\.[cm]?[jt]sx?$/, // foo.generated.ts / .js / .mjs / .tsx …
  /(^|\/)_generated\//, // Convex codegen directory
  /\.min\.[cm]?js$/, // pre-minified vendored scripts
  /(^|\/)dist\//, // built output that some repos commit
];

/**
 * One hunk's share of Jev's state budget; a longer hunk is judged on its head.
 *
 * 3k rather than 6k because Jev answers a 3k hunk in well under a second but
 * stalled past its 30 s timeout on 6k minified hunks, leaving them unjudged. A
 * hunk's head is enough to judge intent.
 */
export const MAX_HUNK_CHARS = 3_000;

const TRUNCATION_MARKER = "\n… (hunk truncated)";

/**
 * Clips text to `max` on a line boundary so the result is still parseable as a
 * diff. Shared with the whole-diff question, which has the same requirement.
 */
export function clipToLineBoundary(
  text: string,
  max: number,
): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const boundary = text.lastIndexOf("\n", max);
  return {
    text: boundary > 0 ? text.slice(0, boundary) : text.slice(0, max),
    clipped: true,
  };
}

/** The `+++ b/x` / `--- a/x` path, with git's one-letter prefix removed. */
function stripPrefix(path: string): string {
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}

function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}

/**
 * Whether a repo-relative path is judge-exempt: a known generated basename, or
 * a path shaped like build output.
 */
export function isIgnoredFile(path: string): boolean {
  if (IGNORED_FILE_NAMES.has(basename(path))) return true;
  return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * The path a block's hunks belong to. Deletions write `+++ /dev/null`, so the
 * old-side path is the only name the file has.
 */
function blockFilePath(lines: readonly string[]): string | null {
  let newPath: string | null = null;
  let oldPath: string | null = null;
  for (const line of lines) {
    if (line.startsWith("@@")) break;
    if (line.startsWith("+++ ")) newPath = line.slice(4).trim();
    else if (line.startsWith("--- ")) oldPath = line.slice(4).trim();
  }
  if (newPath !== null && newPath !== "/dev/null") return stripPrefix(newPath);
  if (oldPath !== null && oldPath !== "/dev/null") return stripPrefix(oldPath);
  return null;
}

function isBinaryBlock(lines: readonly string[]): boolean {
  return lines.some(
    (line) =>
      line.startsWith("Binary files") || line.startsWith("GIT binary patch"),
  );
}

/** Hunks of one `diff --git` block, in diff order. */
function blockHunks(lines: readonly string[]): DiffHunk[] {
  if (isBinaryBlock(lines)) return [];
  const file = blockFilePath(lines);
  if (file === null || isIgnoredFile(file)) return [];

  const hunks: DiffHunk[] = [];
  let header: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (header === null) return;
    const clipped = clipToLineBoundary(body.join("\n"), MAX_HUNK_CHARS);
    hunks.push({
      file,
      header,
      body: clipped.clipped
        ? `${clipped.text}${TRUNCATION_MARKER}`
        : clipped.text,
    });
  };

  for (const line of lines) {
    if (line.startsWith("@@")) {
      flush();
      header = line.trim();
      body = [];
      continue;
    }
    if (header !== null) body.push(line);
  }
  flush();
  return hunks;
}

/**
 * Every judgeable hunk in a unified diff, in diff order. Input that carries no
 * `diff --git` header (empty, or something that is not a diff) yields nothing
 * rather than throwing — the caller then skips the turn.
 */
export function splitDiffIntoHunks(diff: string): DiffHunk[] {
  const lines = diff.split("\n");
  const hunks: DiffHunk[] = [];
  let block: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (block !== null) hunks.push(...blockHunks(block));
      block = [];
      continue;
    }
    if (block !== null) block.push(line);
  }
  if (block !== null) hunks.push(...blockHunks(block));
  return hunks;
}
