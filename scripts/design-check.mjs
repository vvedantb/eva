// Scans apps/web/src and packages/ui/src for the Tailwind/JSX patterns the
// HeroUI-style design system (see CLAUDE.md "UI Design System") replaced:
// arbitrary font sizes, raw radius/shadow/palette utilities, raw <button>
// tags, hardcoded colours, and white/black literals that do not flip with
// the theme. Every check is a plain regex over file text, per line — no
// AST — mirroring scripts/compiler-check.mjs, the house precedent for a
// custom gate: same baseline shape, same --update flow, same tone.
//
//   node scripts/design-check.mjs            check against the baseline
//   node scripts/design-check.mjs --update   rewrite the baseline from disk
//
// The baseline (scripts/design-check-baseline.json) keys on "relpath ::
// reason" — one entry per file+reason PAIR, not per occurrence — so fixing
// 9 of 10 violations in a file does not require touching the baseline; the
// count only ratchets down once a file goes fully clean for that reason.
// Baseline entries that no longer reproduce are reported so the baseline
// can be shrunk, but they never fail the check on their own.
//
// You may only run --update after the violation count has gone DOWN.
// Running it to silence a fresh regression defeats the point of the gate.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = path.join(ROOT, "scripts", "design-check-baseline.json");
const UPDATE = process.argv.includes("--update");

const SCAN_ROOTS = [
  path.join(ROOT, "apps", "web", "src"),
  path.join(ROOT, "packages", "ui", "src"),
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // root may be absent in a partial checkout
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

// --- escape hatches -------------------------------------------------------
const PRAGMA_LINE = "design-check-ignore-next-line";
const PRAGMA_FILE = "design-check-ignore-file";

// Pull the free-text reason out of a pragma comment, e.g.
//   // design-check-ignore-next-line — checkbox radius is fixed by size
// Returns null when the marker is absent, "" when present but reasonless.
function pragmaReason(line, marker) {
  const idx = line.indexOf(marker);
  if (idx === -1) return null;
  return line
    .slice(idx + marker.length)
    .replace(/\*\/\s*$/, "") // trailing block-comment close, if any
    .replace(/^[\s\-—:]+/, "") // leading separators (-, —, :)
    .trim();
}

// --- pattern definitions ---------------------------------------------------
// Tag-only check: not scoped to a string, since JSX tags aren't quoted. The
// `|$` matters: prettier puts `<button` alone on a line whenever the attribute
// list wraps, which is most of them, so without it the check missed the common
// case and only caught single-line buttons.
const RAW_BUTTON_RE = /<button(?=[\s/>]|$)/;

// Quoted string literal contents on a single line. Deliberately naive: it
// does not track matching quote-character pairs across an escaped
// apostrophe (e.g. "it's" mid-string). Accepted tradeoff, same spirit as
// compiler-check.mjs: text-based and okay to miss some, not okay to cry wolf.
const QUOTED_STRING_RE = /["'`]([^"'`]*)["'`]/g;

// A line only counts as "class context" if it assigns className/class or
// calls one of the class-string helpers. This is what keeps hex/rgb/hsl
// literals in ordinary TS — theme tables, SVG fills, chart configs, canvas
// drawing — out of the hardcoded-colour and palette checks below.
const CLASS_CONTEXT_RE = /\b(?:className|class)\s*=|\b(?:cva|cn|clsx)\s*\(/;

/**
 * Net unclosed parentheses in `s`, ignoring anything inside a quoted string.
 * Used to carry class context across lines: prettier wraps almost every
 * multi-class `cn(...)` call, so a per-line scan that stopped at the line
 * holding `className={cn(` would miss the majority of real class strings —
 * exactly the lines most likely to carry drift.
 *
 * Parens only, deliberately. Counting braces too would keep the context open
 * across a wrapped `style={{ ... }}` object, where a hex literal is correct
 * and would false-positive as a hardcoded colour.
 */
function openParenDelta(s) {
  const bare = s.replace(QUOTED_STRING_RE, '""');
  let delta = 0;
  for (const ch of bare) {
    if (ch === "(") delta++;
    else if (ch === ")") delta--;
  }
  return delta;
}

const VARIANT_PREFIX = "(?:[a-z0-9_-]+:)*"; // hover:, sm:, group-hover:, dark:, ...

const ARBITRARY_FONT_SIZE_RE = new RegExp(
  `^${VARIANT_PREFIX}text-\\[\\d+(?:\\.\\d+)?(?:px|rem)\\]$`,
  "i",
);

// Directional infixes Tailwind supports on `rounded-*` (physical + logical).
const RADIUS_DIRECTION = "(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee)";
// rounded-full / rounded-none are deliberately absent from this list: they
// are genuine circles/square-corners, not a raw radius scale value, so they
// stay allowed even directional (e.g. rounded-t-none).
const RAW_RADIUS_RE = new RegExp(
  `^${VARIANT_PREFIX}rounded(?:-${RADIUS_DIRECTION})?-(?:sm|md|lg|xl|2xl|3xl|\\[[^\\]]*\\])$`,
  "i",
);

const SHADOW_RE = new RegExp(
  `^${VARIANT_PREFIX}shadow-(?:2xs|xs|sm|md|lg|xl|2xl)$`,
  "i",
);

const PALETTE_PREFIX =
  "(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)";
const PALETTE_COLOUR =
  "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const RAW_PALETTE_RE = new RegExp(
  `^${VARIANT_PREFIX}${PALETTE_PREFIX}-${PALETTE_COLOUR}-(?:50|\\d00)(?:/\\d+)?$`,
  "i",
);

const TEXT_WHITE_BLACK_RE = new RegExp(
  `^${VARIANT_PREFIX}(?:text|bg)-(?:white|black)(?:/\\d+)?$`,
  "i",
);

// Hex literal (3/6/8 digit) or an rgb()/rgba()/hsl()/hsla() call, still
// gated to CLASS_CONTEXT_RE strings by the caller. Narrow on purpose: it
// will not catch a hex value hidden behind a variable or template
// expression — the goal is the copy-pasted literal, not every path a
// colour could take.
const HARDCODED_COLOUR_RE =
  /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgb|rgba|hsl|hsla)\(/i;

// key: "relpath :: reason" -> Set<line number>, for the report.
const found = new Map();
function addViolation(relPath, reason, lineNumber) {
  const key = `${relPath} :: ${reason}`;
  const lines = found.get(key) ?? new Set();
  lines.add(lineNumber);
  found.set(key, lines);
}

for (const file of SCAN_ROOTS.flatMap((root) => walk(root))) {
  const text = readFileSync(file, "utf8");
  const relPath = path.relative(ROOT, file).split(path.sep).join("/");
  const lines = text.split(/\r?\n/);

  // Whole-file opt-out, must appear in the first 20 lines.
  let fileIgnored = false;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const reason = pragmaReason(lines[i], PRAGMA_FILE);
    if (reason === null) continue;
    if (reason === "") addViolation(relPath, "ignore-without-reason", i + 1);
    else fileIgnored = true;
  }
  if (fileIgnored) continue;

  // Line-level opt-out: a valid pragma suppresses the line immediately
  // below it (the pragma may be its own comment line, or trail real code).
  const ignoredLines = new Set();
  for (let i = 0; i < lines.length; i++) {
    const reason = pragmaReason(lines[i], PRAGMA_LINE);
    if (reason === null) continue;
    if (reason === "") addViolation(relPath, "ignore-without-reason", i + 1);
    else ignoredLines.add(i + 2); // 1-based number of the *next* line
  }

  const isLanding = relPath.startsWith(
    "apps/web/src/routes/_components/landing/",
  );
  const isPackagesUi = relPath.startsWith("packages/ui/src/");

  // Unclosed parens from a class-helper call on an earlier line. While this is
  // above zero, every quoted string we meet is still part of that call.
  let classDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const ignored = ignoredLines.has(lineNumber);

    // raw-button: apps/web/src only — packages/ui/src is where the Button
    // primitive itself lives, so a literal <button> there is expected.
    if (!ignored && !isPackagesUi && RAW_BUTTON_RE.test(line)) {
      addViolation(relPath, "raw-button", lineNumber);
    }

    // Work out whether this line is class context, and from which column, then
    // update the carried depth. This must run even for an ignored line, or the
    // pragma would silently swallow the rest of the call.
    let scanFrom = 0;
    let inClassContext = classDepth > 0;
    if (!inClassContext) {
      const match = CLASS_CONTEXT_RE.exec(line);
      if (match) {
        inClassContext = true;
        scanFrom = match.index;
      }
    }
    if (inClassContext) {
      classDepth = Math.max(
        0,
        classDepth + openParenDelta(line.slice(scanFrom)),
      );
    }

    if (!inClassContext || ignored) continue;
    const classText = [...line.slice(scanFrom).matchAll(QUOTED_STRING_RE)]
      .map((m) => m[1])
      .join(" ");
    if (!classText) continue;
    const tokens = classText.split(/\s+/).filter(Boolean);

    if (!isLanding && tokens.some((t) => ARBITRARY_FONT_SIZE_RE.test(t))) {
      addViolation(relPath, "arbitrary-font-size", lineNumber);
    }
    if (tokens.some((t) => RAW_RADIUS_RE.test(t))) {
      addViolation(relPath, "raw-radius", lineNumber);
    }
    // shadow: apps/web/src only — floating overlay primitives that may
    // legitimately keep a shadow all live in packages/ui/src.
    if (!isPackagesUi && tokens.some((t) => SHADOW_RE.test(t))) {
      addViolation(relPath, "shadow-outside-overlay", lineNumber);
    }
    if (tokens.some((t) => RAW_PALETTE_RE.test(t))) {
      addViolation(relPath, "raw-palette-colour", lineNumber);
    }
    // text-white-black is NOT path-exempted for packages/ui/src: genuine
    // scrim cases exist there, but rather than blanket-allow the package we
    // let those specific files land in the baseline like anything else.
    if (tokens.some((t) => TEXT_WHITE_BLACK_RE.test(t))) {
      addViolation(relPath, "text-white-black", lineNumber);
    }
    if (HARDCODED_COLOUR_RE.test(classText)) {
      addViolation(relPath, "hardcoded-colour", lineNumber);
    }
  }
}

const keys = [...found.keys()].sort();

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2) + "\n");
  console.log(`design-check: baseline updated (${keys.length} entries).`);
  process.exit(0);
}

// --- report, grouped by reason so a human can work one category at a time
const byReason = new Map();
for (const key of keys) {
  const reason = key.slice(key.lastIndexOf(" :: ") + 4);
  const list = byReason.get(reason) ?? [];
  list.push(key);
  byReason.set(reason, list);
}

let totalOccurrences = 0;
for (const [reason, reasonKeys] of [...byReason].sort()) {
  let reasonOccurrences = 0;
  console.log(
    `\n${reason} (${reasonKeys.length} file${reasonKeys.length === 1 ? "" : "s"}):`,
  );
  for (const key of reasonKeys) {
    const relPath = key.slice(0, key.lastIndexOf(" :: "));
    const lineNumbers = [...found.get(key)].sort((a, b) => a - b);
    reasonOccurrences += lineNumbers.length;
    console.log(
      `  ${relPath}  (${lineNumbers.length}) — lines: ${lineNumbers.join(", ")}`,
    );
  }
  totalOccurrences += reasonOccurrences;
}
console.log(
  `\ndesign-check: ${keys.length} file+reason pair${keys.length === 1 ? "" : "s"}, ${totalOccurrences} occurrence${totalOccurrences === 1 ? "" : "s"} total.`,
);

let baseline = [];
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  console.error(
    "\ndesign-check: no baseline found. Run `node scripts/design-check.mjs --update` first.",
  );
  process.exit(1);
}

const baselineSet = new Set(baseline);
const fresh = keys.filter((k) => !baselineSet.has(k));
const fixed = baseline.filter((k) => !found.has(k));

if (fixed.length > 0) {
  console.log(
    `\ndesign-check: ${fixed.length} baseline entr${fixed.length === 1 ? "y" : "ies"} no longer reproduce (run --update to shrink the baseline):`,
  );
  for (const k of fixed) console.log(`  - ${k}`);
}

if (fresh.length === 0) {
  console.log(
    `\ndesign-check: OK — ${keys.length} known violation${keys.length === 1 ? "" : "s"}, none new.`,
  );
  process.exit(0);
}

console.error(
  `\ndesign-check: ${fresh.length} NEW violation${fresh.length === 1 ? "" : "s"} not in the baseline:`,
);
for (const key of fresh) {
  const lineNumbers = [...found.get(key)].sort((a, b) => a - b);
  console.error(`  ${key}  (line ${lineNumbers.join(", ")})`);
}
console.error(
  "\nFix the pattern (see CLAUDE.md UI Design System), add a\n" +
    "// design-check-ignore-next-line — <reason> if this instance is deliberate,\n" +
    "or run `node scripts/design-check.mjs --update` to accept it into the\n" +
    "baseline. Only run --update after the violation COUNT has gone down —\n" +
    "using it to wave through a fresh regression defeats the gate.",
);
process.exit(1);
