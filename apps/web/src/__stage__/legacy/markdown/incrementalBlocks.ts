import { parseMarkdownIntoBlocks } from "streamdown";

/**
 * Streamdown already renders a streamed reply block by block: each block is
 * memoised on its own text, so appending a token only re-renders the block
 * still being written. What it does *not* skip is the split itself — the
 * default `parseMarkdownIntoBlocks` runs marked's block lexer over the whole
 * reply on every token, so a long answer costs O(length) lexing per token and
 * O(length^2) over the turn. That is the work behind the mid-stream freezes on
 * a slow laptop: the DOM update is small, the re-parse before it is not.
 *
 * This is the same split, done incrementally. Blocks already produced from a
 * byte-identical prefix are reused verbatim and only the tail is re-lexed, so
 * the per-token cost is one prefix comparison plus lexing the paragraph being
 * written. Identical output, not an approximation — see the invariant test.
 *
 * Reuse is only allowed up to a block that ends on a blank line. A blank line
 * closes every leaf block in CommonMark, so marked's tokeniser starts the next
 * block from a clean state and cannot reinterpret what came before it (a
 * setext underline, a lazy list continuation). Without such a boundary we fall
 * back to a full parse.
 */

/** How many recent splits to keep. In practice: the streaming reply, plus the
 *  streamed reasoning prose rendered alongside it, plus headroom. */
const CACHE_SIZE = 4;

interface BlockSplit {
  source: string;
  blocks: string[];
  /**
   * `blocks.join("") === source`, so a block index maps to a source offset.
   * False when marked normalised the input (CRLF, say); such a split can be
   * returned but never used as a base.
   */
  exact: boolean;
  /** Source offset at which block `i` ends. */
  offsets: number[];
  /** Whether block `i` ends on a blank line, i.e. is a safe cut point. */
  endsClean: boolean[];
  /** Longest reusable prefix: block count, source length, and the text itself.
   *  Precomputed so a tick costs one string comparison, not a per-block scan. */
  cleanCount: number;
  cleanLength: number;
  cleanText: string;
}

const cache: BlockSplit[] = [];

/** A block that ends on a blank line closes cleanly. */
const ENDS_ON_BLANK_LINE = /\n[ \t]*\n$/;

/**
 * Footnotes make Streamdown emit the whole document as one block, because a
 * reference resolves against a definition anywhere in it. Any document that
 * could take that path is parsed whole — a prefix split from before the
 * footnote appeared would not match what a full parse produces now.
 */
function mayContainFootnotes(markdown: string): boolean {
  return markdown.includes("[^");
}

/**
 * Indexes a split so later ticks can slice it by offset without re-scanning.
 * The final block is never a cut point: it is the one still being written.
 */
function describeSplit(
  source: string,
  blocks: string[],
  exact: boolean,
): BlockSplit {
  const offsets: number[] = [];
  const endsClean: boolean[] = [];
  let offset = 0;
  let cleanCount = 0;
  let cleanLength = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] ?? "";
    offset += block.length;
    offsets.push(offset);
    const clean = ENDS_ON_BLANK_LINE.test(block);
    endsClean.push(clean);
    if (clean && i < blocks.length - 1) {
      cleanCount = i + 1;
      cleanLength = offset;
    }
  }
  return {
    source,
    blocks,
    exact,
    offsets,
    endsClean,
    cleanCount,
    cleanLength,
    cleanText: exact && cleanLength > 0 ? source.slice(0, cleanLength) : "",
  };
}

function fullSplit(markdown: string): BlockSplit {
  const blocks = parseMarkdownIntoBlocks(markdown);
  return describeSplit(markdown, blocks, blocks.join("") === markdown);
}

/**
 * How much of `base` is a byte-identical, cleanly-closed prefix of `markdown`.
 * The common case — the reply only grew — is one string comparison. The slow
 * walk is for a rewritten tail: Streamdown closes an open code fence before
 * splitting, so the string it hands us can change at the end between ticks.
 */
function reusablePrefix(
  base: BlockSplit,
  markdown: string,
): { count: number; length: number } {
  if (base.cleanLength === 0) return { count: 0, length: 0 };
  if (markdown.startsWith(base.cleanText)) {
    return { count: base.cleanCount, length: base.cleanLength };
  }
  let count = 0;
  let length = 0;
  for (let i = 0; i < base.blocks.length - 1; i++) {
    const block = base.blocks[i];
    const end = base.offsets[i];
    if (block === undefined || end === undefined) break;
    if (!markdown.startsWith(block, end - block.length)) break;
    if (base.endsClean[i] === true) {
      count = i + 1;
      length = end;
    }
  }
  return { count, length };
}

function splitIncrementally(markdown: string): BlockSplit {
  let best: { base: BlockSplit; count: number; length: number } | null = null;
  for (const base of cache) {
    if (!base.exact) continue;
    const prefix = reusablePrefix(base, markdown);
    if (prefix.length === 0) continue;
    if (best === null || prefix.length > best.length) {
      best = { base, ...prefix };
    }
  }
  if (best === null) return fullSplit(markdown);

  const tail = markdown.slice(best.length);
  const tailBlocks = parseMarkdownIntoBlocks(tail);
  return describeSplit(
    markdown,
    [...best.base.blocks.slice(0, best.count), ...tailBlocks],
    tailBlocks.join("") === tail,
  );
}

/**
 * Drop-in replacement for Streamdown's `parseMarkdownIntoBlocksFn`. Stable
 * module-level identity, so passing it does not invalidate Streamdown's own
 * memo on the split.
 */
export function parseMarkdownIntoBlocksIncremental(markdown: string): string[] {
  for (let i = 0; i < cache.length; i++) {
    const entry = cache[i];
    if (entry === undefined || entry.source !== markdown) continue;
    if (i > 0) {
      cache.splice(i, 1);
      cache.unshift(entry);
    }
    return entry.blocks;
  }

  const split = mayContainFootnotes(markdown)
    ? fullSplit(markdown)
    : splitIncrementally(markdown);
  cache.unshift(split);
  if (cache.length > CACHE_SIZE) cache.length = CACHE_SIZE;
  return split.blocks;
}

/** Test seam: the cache is module state shared by every Streamdown instance. */
export function resetIncrementalMarkdownBlocks(): void {
  cache.length = 0;
}
