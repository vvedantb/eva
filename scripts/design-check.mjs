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
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (
      /\.(?:tsx?|css)$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      out.push(p);
    }
  }
  return out;
}

const PRAGMA_LINE = "design-check-ignore-next-line";
const PRAGMA_FILE = "design-check-ignore-file";

//   // design-check-ignore-next-line — checkbox radius is fixed by size
function pragmaReason(line, marker) {
  const idx = line.indexOf(marker);
  if (idx === -1) return null;
  return line
    .slice(idx + marker.length)
    .replace(/\*\/\s*$/, "")
    .replace(/^[\s\-—:]+/, "")
    .trim();
}

const RAW_BUTTON_RE = /<button(?=[\s/>]|$)/;

const QUOTED_STRING_RE = /["'`]([^"'`]*)["'`]/g;

const CLASS_CONTEXT_RE = /\b(?:className|class)\s*=|\b(?:cva|cn|clsx)\s*\(/;

function openParenDelta(s) {
  const bare = s.replace(QUOTED_STRING_RE, '""');
  let delta = 0;
  for (const ch of bare) {
    if (ch === "(") delta++;
    else if (ch === ")") delta--;
  }
  return delta;
}

const VARIANT_PREFIX = "(?:[a-z0-9_-]+:)*";

const ARBITRARY_FONT_SIZE_RE = new RegExp(
  `^${VARIANT_PREFIX}text-\\[\\d+(?:\\.\\d+)?(?:px|rem)\\]$`,
  "i",
);

const RADIUS_DIRECTION = "(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee)";
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

const HARDCODED_COLOUR_RE =
  /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgb|rgba|hsl|hsla)\(/i;

const REDUCED_MOTION_RE =
  /prefers-reduced-motion|\buseReducedMotion\b|\breducedMotion\s*[:=]\s*\{?\s*["'](?:user|always)["']/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;

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

  let fileIgnored = false;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const reason = pragmaReason(lines[i], PRAGMA_FILE);
    if (reason === null) continue;
    if (reason === "") addViolation(relPath, "ignore-without-reason", i + 1);
    else fileIgnored = true;
  }
  if (fileIgnored) continue;

  const ignoredLines = new Set();
  for (let i = 0; i < lines.length; i++) {
    const reason = pragmaReason(lines[i], PRAGMA_LINE);
    if (reason === null) continue;
    if (reason === "") addViolation(relPath, "ignore-without-reason", i + 1);
    else ignoredLines.add(i + 2);
  }

  const isLanding = relPath.startsWith(
    "apps/web/src/routes/_components/landing/",
  );
  const isPackagesUi = relPath.startsWith("packages/ui/src/");
  const isCss = relPath.endsWith(".css");

  let classDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const ignored = ignoredLines.has(lineNumber);

    if (
      !ignored &&
      !COMMENT_LINE_RE.test(line) &&
      REDUCED_MOTION_RE.test(line)
    ) {
      addViolation(relPath, "reduced-motion", lineNumber);
    }
    if (isCss) continue;

    if (!ignored && !isPackagesUi && RAW_BUTTON_RE.test(line)) {
      addViolation(relPath, "raw-button", lineNumber);
    }

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
    if (!isPackagesUi && tokens.some((t) => SHADOW_RE.test(t))) {
      addViolation(relPath, "shadow-outside-overlay", lineNumber);
    }
    if (tokens.some((t) => RAW_PALETTE_RE.test(t))) {
      addViolation(relPath, "raw-palette-colour", lineNumber);
    }
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
