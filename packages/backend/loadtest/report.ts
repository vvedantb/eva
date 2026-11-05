// Builds a self-contained HTML report from one or two result files.
//
//   node loadtest/report.ts [--before before] [--after after] [--out report]
//
// Reads loadtest/results/<label>.json and writes loadtest/results/<out>.html.
// Charts are inline SVG; no network or chart library needed.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { resultsFileSchema } from "./schema.ts";
import type { CaseResult, ResultsFile, Sample } from "./schema.ts";
import { bootstrapMedianCi, mannWhitney, median } from "./stats.ts";

const RESULTS_DIR = path.join(import.meta.dirname, "results");
const { values: flags } = parseArgs({
  options: {
    before: { type: "string", default: "before" },
    after: { type: "string", default: "after" },
    out: { type: "string", default: "report" },
  },
});

function load(label: string): ResultsFile | null {
  const file = path.join(RESULTS_DIR, `${label}.json`);
  if (!fs.existsSync(file)) return null;
  return resultsFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

const before = load(flags.before);
if (!before) throw new Error(`missing results/${flags.before}.json`);
const after = load(flags.after);

type Run = "before" | "after";
type Summary = {
  ok: number;
  failed: number;
  error: string | null;
  docs: number | null;
  bytes: number | null;
  serverMs: Array<number>;
  p50: number;
  ci: { lo: number; hi: number };
};

function summarise(samples: ReadonlyArray<Sample>): Summary {
  const ok = samples.filter((s) => s.error === null);
  const serverMs = ok.flatMap((s) => (s.serverMs === null ? [] : [s.serverMs]));
  const docs = ok.flatMap((s) => (s.docsRead === null ? [] : [s.docsRead]));
  const bytes = ok.flatMap((s) => (s.bytesRead === null ? [] : [s.bytesRead]));
  return {
    ok: ok.length,
    failed: samples.length - ok.length,
    error: samples.find((s) => s.error !== null)?.error ?? null,
    docs: docs.length ? median(docs) : null,
    bytes: bytes.length ? median(bytes) : null,
    serverMs,
    p50: serverMs.length ? median(serverMs) : Number.NaN,
    ci: bootstrapMedianCi(serverMs),
  };
}

const scales = before.scales.map((s) => s.scale);
const caseNames = before.scales[0]?.cases.map((c) => c.name) ?? [];
const surfaceByCase = new Map<string, string>(
  before.scales[0]?.cases.map((c) => [c.name, c.surface]) ?? [],
);

function caseAt(file: ResultsFile | null, scale: number, name: string): CaseResult | undefined {
  return file?.scales.find((s) => s.scale === scale)?.cases.find((c) => c.name === name);
}

const summaries = new Map<string, Summary>();
function key(run: Run, scale: number, name: string) {
  return `${run}|${scale}|${name}`;
}
for (const name of caseNames) {
  for (const scale of scales) {
    const b = caseAt(before, scale, name);
    if (b) summaries.set(key("before", scale, name), summarise(b.samples));
    const a = caseAt(after, scale, name);
    if (a) summaries.set(key("after", scale, name), summarise(a.samples));
  }
}
function get(run: Run, scale: number, name: string): Summary | undefined {
  return summaries.get(key(run, scale, name));
}

// Mann-Whitney per (case, scale) with Holm-Bonferroni across the family.
type Test = { name: string; scale: number; p: number; delta: number; adjusted: number };
const tests: Array<Test> = [];
for (const name of caseNames) {
  for (const scale of scales) {
    const b = get("before", scale, name);
    const a = get("after", scale, name);
    if (!b || !a || b.serverMs.length < 5 || a.serverMs.length < 5) continue;
    const { p, cliffsDelta } = mannWhitney(b.serverMs, a.serverMs);
    tests.push({ name, scale, p, delta: cliffsDelta, adjusted: p });
  }
}
const byP = [...tests].sort((x, y) => x.p - y.p);
let running = 0;
byP.forEach((t, i) => {
  running = Math.max(running, Math.min(1, t.p * (byP.length - i)));
  t.adjusted = running;
});
const testFor = (name: string, scale: number) => tests.find((t) => t.name === name && t.scale === scale);

// ---------------------------------------------------------------------------
// Formatting

function compact(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "–";
  if (n >= 1e6) return `${Number((n / 1e6).toFixed(1))}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${Number((n / 1e3).toFixed(1))}K`;
  return String(Math.round(n));
}
function ms(n: number): string {
  if (Number.isNaN(n)) return "–";
  return n >= 100 ? `${Math.round(n)}` : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}
function mib(bytes: number | null): string {
  if (bytes === null) return "–";
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)}`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function pFmt(p: number): string {
  if (Number.isNaN(p)) return "–";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

// ---------------------------------------------------------------------------
// Charts

const W = 300;
const H = 170;
const PAD = { l: 44, r: 12, t: 14, b: 26 };

function logScale(min: number, max: number, lo: number, hi: number) {
  const a = Math.log10(Math.max(min, 1e-3));
  const b = Math.log10(Math.max(max, min * 10));
  return (v: number) => lo + ((Math.log10(Math.max(v, 1e-3)) - a) / (b - a)) * (hi - lo);
}
function logTicks(min: number, max: number): Array<number> {
  const ticks: Array<number> = [];
  for (let e = Math.floor(Math.log10(Math.max(min, 1e-3))); e <= Math.ceil(Math.log10(max)); e++) ticks.push(10 ** e);
  return ticks;
}

type Point = { scale: number; value: number | null; failed: boolean; tip: string; lo?: number; hi?: number };

/** One small multiple: x = scale (log, categorical steps), y = log value. */
function miniChart(title: string, unit: string, series: Array<{ run: Run; points: Array<Point> }>, limit?: number): string {
  const values = series.flatMap((s) => s.points.flatMap((p) => (p.value === null ? [] : [p.value, p.hi ?? p.value, p.lo ?? p.value])));
  if (limit) values.push(limit);
  const min = Math.max(Math.min(...values, 1), 0.1);
  const max = Math.max(...values, 10);
  const y = logScale(min, max, H - PAD.b, PAD.t);
  const x = (scale: number) => PAD.l + (scales.indexOf(scale) / Math.max(scales.length - 1, 1)) * (W - PAD.l - PAD.r);
  const ticks = logTicks(min, max).filter((t) => t >= min / 1.01 && t <= max * 1.01);
  const parts: Array<string> = [];
  parts.push(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`);
  for (const t of ticks) {
    parts.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>`);
    parts.push(`<text class="tick" x="${PAD.l - 6}" y="${y(t) + 3}" text-anchor="end">${compact(t)}</text>`);
  }
  for (const s of scales) parts.push(`<text class="tick" x="${x(s)}" y="${H - 8}" text-anchor="middle">${s}×</text>`);
  if (limit) {
    parts.push(`<line class="limit" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(limit)}" y2="${y(limit)}"/>`);
    parts.push(`<text class="tick" x="${W - PAD.r}" y="${y(limit) - 4}" text-anchor="end">Convex limit ${compact(limit)}</text>`);
  }
  for (const s of series) {
    const pts = s.points.filter((p) => p.value !== null && !p.failed);
    const band = pts.filter((p) => p.lo !== undefined && p.hi !== undefined);
    if (band.length > 1) {
      const top = band.map((p) => `${x(p.scale)},${y(p.hi ?? 0)}`).join(" ");
      const bottom = [...band].reverse().map((p) => `${x(p.scale)},${y(p.lo ?? 0)}`).join(" ");
      parts.push(`<polygon class="band ${s.run}" points="${top} ${bottom}"/>`);
    }
    if (pts.length > 1) {
      parts.push(`<polyline class="line ${s.run}" points="${pts.map((p) => `${x(p.scale)},${y(p.value ?? 0)}`).join(" ")}"/>`);
    }
    for (const p of s.points) {
      if (p.failed) {
        const cx = x(p.scale) + (s.run === "after" ? 5 : -5);
        parts.push(`<g class="fail" data-tip="${esc(p.tip)}"><circle class="hit" cx="${cx}" cy="${PAD.t + 4}" r="9"/><path d="M${cx - 4},${PAD.t} l8,8 M${cx + 4},${PAD.t} l-8,8"/></g>`);
      } else if (p.value !== null) {
        const cx = x(p.scale);
        const cy = y(p.value);
        const mark = s.run === "before"
          ? `<circle class="dot before" cx="${cx}" cy="${cy}" r="4"/>`
          : `<rect class="dot after" x="${cx - 4}" y="${cy - 4}" width="8" height="8" rx="1"/>`;
        parts.push(`<g data-tip="${esc(p.tip)}"><circle class="hit" cx="${cx}" cy="${cy}" r="10"/>${mark}</g>`);
      }
    }
  }
  parts.push(`</svg>`);
  return `<figure class="mini"><figcaption>${esc(title)} <span class="unit">${esc(unit)}</span></figcaption>${parts.join("")}</figure>`;
}

const DOC_LIMIT = 32_000;

function pointsFor(name: string, run: Run, metric: "docs" | "time"): Array<Point> {
  return scales.flatMap((scale): Array<Point> => {
    const s = get(run, scale, name);
    if (!s) return [];
    const failed = s.ok === 0;
    const label = `${name} · ${run} · ${scale}×`;
    if (failed) return [{ scale, value: null, failed, tip: `${label}\nFAILED: ${s.error ?? "error"}` }];
    if (metric === "docs") {
      return [{ scale, value: s.docs, failed, tip: `${label}\n${compact(s.docs)} documents read · ${mib(s.bytes)} MiB` }];
    }
    return [{
      scale,
      value: s.p50,
      lo: s.ci.lo,
      hi: s.ci.hi,
      failed,
      tip: `${label}\nmedian ${ms(s.p50)} ms (95% CI ${ms(s.ci.lo)}–${ms(s.ci.hi)}) · n=${s.serverMs.length}${s.failed ? ` · ${s.failed} failed` : ""}`,
    }];
  });
}

// Overview dumbbell: documents read at the largest scale, before → after.
function dumbbell(): string {
  const top = scales[scales.length - 1] ?? 1;
  const rows = caseNames
    .map((name) => ({ name, b: get("before", top, name), a: get("after", top, name) }))
    .sort((x, y) => (y.b?.docs ?? DOC_LIMIT * 2) - (x.b?.docs ?? DOC_LIMIT * 2) || (y.b?.failed ?? 0) - (x.b?.failed ?? 0));
  const rowH = 20;
  const left = 250;
  const width = 900;
  const height = rows.length * rowH + 40;
  const x = logScale(1, 1e6, left, width - 70);
  const parts: Array<string> = [`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Documents read at ${top}× per query">`];
  for (const t of [1, 10, 100, 1e3, 1e4, 1e5, 1e6]) {
    parts.push(`<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="10" y2="${height - 24}"/><text class="tick" x="${x(t)}" y="${height - 8}" text-anchor="middle">${compact(t)}</text>`);
  }
  parts.push(`<line class="limit" x1="${x(DOC_LIMIT)}" x2="${x(DOC_LIMIT)}" y1="10" y2="${height - 24}"/><text class="tick" x="${x(DOC_LIMIT) + 4}" y="20">Convex limit 32K</text>`);
  const FAIL_X = width - 40;
  rows.forEach((r, i) => {
    const cy = 30 + i * rowH;
    parts.push(`<text class="label" x="${left - 10}" y="${cy + 4}" text-anchor="end">${esc(r.name)}</text>`);
    const bx = r.b ? (r.b.ok === 0 ? FAIL_X : x(r.b.docs ?? 1)) : null;
    const ax = r.a ? (r.a.ok === 0 ? FAIL_X : x(r.a.docs ?? 1)) : null;
    if (bx !== null && ax !== null) parts.push(`<line class="connector" x1="${bx}" x2="${ax}" y1="${cy}" y2="${cy}"/>`);
    const marks: Array<{ run: Run; s: Summary | undefined; cx: number | null }> = [
      { run: "before", s: r.b, cx: bx },
      { run: "after", s: r.a, cx: ax },
    ];
    for (const { run, s, cx } of marks) {
      if (!s || cx === null) continue;
      const tip = `${r.name} · ${run} · ${top}×\n${s.ok === 0 ? `FAILED: ${s.error ?? ""}` : `${compact(s.docs)} documents read · median ${ms(s.p50)} ms`}`;
      const mark = s.ok === 0
        ? `<path class="failmark" d="M${cx - 4},${cy - 4} l8,8 M${cx + 4},${cy - 4} l-8,8"/>`
        : run === "before"
          ? `<circle class="dot before" cx="${cx}" cy="${cy}" r="4.5"/>`
          : `<rect class="dot after" x="${cx - 4.5}" y="${cy - 4.5}" width="9" height="9" rx="1"/>`;
      parts.push(`<g data-tip="${esc(tip)}"><circle class="hit" cx="${cx}" cy="${cy}" r="10"/>${mark}</g>`);
    }
  });
  parts.push(`<text class="tick" x="${FAIL_X}" y="20" text-anchor="middle">failed</text></svg>`);
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Tables

function statsTable(): string {
  const head = `<tr><th>Query</th><th>Scale</th><th class="num">Docs read<br>before → after</th><th class="num">Median ms before<br>(95% CI)</th><th class="num">Median ms after<br>(95% CI)</th><th class="num">Speed-up</th><th class="num">p (Holm)</th><th class="num">Cliff's δ</th><th>Status</th></tr>`;
  const rows: Array<string> = [];
  for (const name of caseNames) {
    scales.forEach((scale, i) => {
      const b = get("before", scale, name);
      const a = get("after", scale, name);
      const t = testFor(name, scale);
      const status = (s: Summary | undefined) => (!s ? "" : s.ok === 0 ? "fail" : s.failed ? "partial" : "ok");
      const bs = status(b);
      const as = status(a);
      const badge = (s: string, run: string) =>
        s === "fail" ? `<span class="badge critical">✕ ${run} fails</span>` : s === "partial" ? `<span class="badge warning">! ${run} partly fails</span>` : "";
      const fixed = bs === "fail" && as === "ok" ? `<span class="badge good">✓ fixed</span>` : "";
      const speed = b && a && b.ok && a.ok ? `${(b.p50 / a.p50).toFixed(1)}×` : "–";
      rows.push(`<tr${i === 0 ? ' class="group"' : ""}>
        <td>${i === 0 ? `<b>${esc(name)}</b><div class="muted">${esc(surfaceByCase.get(name) ?? "")}</div>` : ""}</td>
        <td>${scale}×</td>
        <td class="num">${b?.ok ? compact(b.docs) : b ? "fail" : "–"} → ${a ? (a.ok ? compact(a.docs) : "fail") : "–"}</td>
        <td class="num">${b?.ok ? `${ms(b.p50)} <span class="muted">(${ms(b.ci.lo)}–${ms(b.ci.hi)})</span>` : "–"}</td>
        <td class="num">${a?.ok ? `${ms(a.p50)} <span class="muted">(${ms(a.ci.lo)}–${ms(a.ci.hi)})</span>` : "–"}</td>
        <td class="num">${speed}</td>
        <td class="num">${t ? pFmt(t.adjusted) : "–"}</td>
        <td class="num">${t ? t.delta.toFixed(2) : "–"}</td>
        <td>${fixed || badge(as, "after") || badge(bs, "before")}${bs === "fail" ? `<div class="muted err">${esc((b?.error ?? "").slice(0, 140))}</div>` : ""}</td>
      </tr>`);
    });
  }
  return `<table>${head}${rows.join("")}</table>`;
}

function datasetTable(file: ResultsFile): string {
  const tables = [...new Set(file.scales.flatMap((s) => Object.keys(s.tableCounts)))].sort();
  const head = `<tr><th>Table</th>${file.scales.map((s) => `<th class="num">${s.scale}×</th>`).join("")}</tr>`;
  const rows = tables.map((t) => `<tr><td>${esc(t)}</td>${file.scales.map((s) => `<td class="num">${(s.tableCounts[t] ?? 0).toLocaleString("en-GB")}</td>`).join("")}</tr>`);
  const total = `<tr class="group"><td><b>Total</b></td>${file.scales.map((s) => `<td class="num"><b>${s.seedDocs.toLocaleString("en-GB")}</b></td>`).join("")}</tr>`;
  return `<table class="compact">${head}${rows.join("")}${total}</table>`;
}

// ---------------------------------------------------------------------------

const top = scales[scales.length - 1] ?? 1;
const failingBefore = caseNames.filter((n) => (get("before", top, n)?.ok ?? 1) === 0);
const failingAfter = after ? caseNames.filter((n) => (get("after", top, n)?.ok ?? 1) === 0) : [];
const overLimitBefore = caseNames.filter((n) => {
  const s = get("before", top, n);
  return s !== undefined && (s.ok === 0 || (s.docs ?? 0) > DOC_LIMIT / 4);
});
const significant = tests.filter((t) => t.adjusted < 0.05 && t.delta > 0).length;

const tiles = [
  ["Queries tested", String(caseNames.length)],
  ["Samples per query per scale", before.scales.map((s) => `${s.samples ?? before.samplesPerCase} @${s.scale}×`).join(", ")],
  [`Fail at ${top}× before`, String(failingBefore.length)],
  ...(after ? [[`Fail at ${top}× after`, String(failingAfter.length)], ["Significantly faster (Holm p<0.05)", `${significant} / ${tests.length}`]] : []),
  [`Read >8K docs or fail at ${top}× before`, String(overLimitBefore.length)],
];

function afterSeries(name: string, metric: "docs" | "time"): { run: Run; points: Array<Point> } {
  return { run: "after", points: pointsFor(name, "after", metric) };
}

const smallMultiples = caseNames
  .map((name) => {
    const series = (metric: "docs" | "time"): Array<{ run: Run; points: Array<Point> }> => [
      { run: "before", points: pointsFor(name, "before", metric) },
      ...(after ? [afterSeries(name, metric)] : []),
    ];
    return `<section class="case"><h3>${esc(name)} <span class="muted">${esc(surfaceByCase.get(name) ?? "")}</span></h3><div class="pair">
      ${miniChart("Documents read", "median, log scale", series("docs"), DOC_LIMIT)}
      ${miniChart("Server time", "median ms, 95% CI band, log scale", series("time"))}
    </div></section>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Convex query load test</title>
<style>
.viz-root{color-scheme:light;--surface-1:#fcfcfb;--page:#f9f9f7;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--series-1:#2a78d6;--series-2:#eb6834;--critical:#d03b3b;--warning:#fab219;--good:#0ca30c;--good-text:#006300;--ring:rgba(11,11,11,.10)}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{color-scheme:dark;--surface-1:#1a1a19;--page:#0d0d0d;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--series-1:#3987e5;--series-2:#d95926;--good-text:#0ca30c;--ring:rgba(255,255,255,.10)}}
:root[data-theme="dark"] .viz-root{color-scheme:dark;--surface-1:#1a1a19;--page:#0d0d0d;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--series-1:#3987e5;--series-2:#d95926;--good-text:#0ca30c;--ring:rgba(255,255,255,.10)}
body{margin:0}
.viz-root{background:var(--page);color:var(--text-primary);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px;min-height:100vh;box-sizing:border-box}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:36px 0 8px}h3{font-size:14px;margin:0 0 6px}
.muted{color:var(--text-secondary);font-weight:400}.unit{color:var(--muted);font-weight:400}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
.tile{background:var(--surface-1);border-radius:10px;padding:12px 16px;min-width:150px;box-shadow:0 0 0 1px var(--ring)}
.tile .v{font-size:24px;font-weight:600}.tile .l{color:var(--text-secondary);font-size:12px}
.card{background:var(--surface-1);border-radius:12px;padding:16px;box-shadow:0 0 0 1px var(--ring)}
.legend{display:flex;gap:18px;align-items:center;color:var(--text-secondary);font-size:12px;margin:6px 0 10px;flex-wrap:wrap}
.legend svg{vertical-align:middle;margin-right:6px}
.grid-cases{display:grid;grid-template-columns:repeat(auto-fill,minmax(640px,1fr));gap:12px}
.case{background:var(--surface-1);border-radius:12px;padding:12px 14px;box-shadow:0 0 0 1px var(--ring)}
.pair{display:flex;gap:8px}.mini{margin:0;flex:1}.mini figcaption{font-size:12px;color:var(--text-secondary)}
svg.chart{width:100%;height:auto;overflow:visible}
.card svg.chart{max-width:1100px}
.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}.label{fill:var(--text-primary);font-size:12px}
.limit{stroke:var(--critical);stroke-width:1;opacity:.7}
.line{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.line.before{stroke:var(--series-1)}.line.after{stroke:var(--series-2)}
.band.before{fill:var(--series-1);opacity:.1}.band.after{fill:var(--series-2);opacity:.1}
.dot{stroke:var(--surface-1);stroke-width:2}.dot.before{fill:var(--series-1)}.dot.after{fill:var(--series-2)}
.connector{stroke:var(--axis);stroke-width:2}
.fail path,.failmark{stroke:var(--critical);stroke-width:2.5;stroke-linecap:round;fill:none}
.hit{fill:transparent}
table{border-collapse:collapse;width:100%;background:var(--surface-1);border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px var(--ring);font-size:12.5px}
th,td{padding:5px 10px;text-align:left;vertical-align:top}th{color:var(--text-secondary);font-weight:500;background:var(--page)}
tr.group td{border-top:1px solid var(--grid)}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.compact{width:auto}
.badge{display:inline-block;border-radius:6px;padding:1px 6px;font-size:11.5px;font-weight:600;white-space:nowrap}
.badge.critical{color:var(--critical);box-shadow:inset 0 0 0 1px var(--critical)}.badge.warning{color:var(--text-primary);box-shadow:inset 0 0 0 1px var(--warning)}.badge.good{color:var(--good-text);box-shadow:inset 0 0 0 1px var(--good)}
.err{font-size:11px;max-width:360px}
#tip{position:fixed;pointer-events:none;background:var(--surface-1);color:var(--text-primary);box-shadow:0 0 0 1px var(--ring),0 6px 20px rgba(0,0,0,.15);border-radius:8px;padding:6px 9px;font-size:12px;white-space:pre-line;display:none;max-width:420px;z-index:10}
p.note{color:var(--text-secondary);max-width:900px}
</style></head>
<body><div class="viz-root">
<h1>Convex query load test</h1>
<div class="muted">Before ${esc(before.gitSha)} · ${esc(before.startedAt)}${after ? ` &nbsp;|&nbsp; After ${esc(after.gitSha)} · ${esc(after.startedAt)}` : ""} · scales ${scales.map((s) => `${s}×`).join(", ")} · local convex-local-backend</div>
<div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><div class="v">${v}</div><div class="l">${esc(l ?? "")}</div></div>`).join("")}</div>
<div class="legend">
  <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--series-1)" stroke-width="2"/><circle cx="11" cy="5" r="4" fill="var(--series-1)"/></svg>Before (circle)</span>
  ${after ? `<span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--series-2)" stroke-width="2"/><rect x="7" y="1" width="8" height="8" fill="var(--series-2)"/></svg>After (square)</span>` : ""}
  <span><svg width="12" height="12"><path d="M2,2 l8,8 M10,2 l-8,8" stroke="var(--critical)" stroke-width="2.5"/></svg>Query failed (hover for the error)</span>
  <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--critical)" stroke-width="1"/></svg>Convex limit: 32,000 documents scanned per function</span>
</div>

<h2>Documents read per query at ${top}×</h2>
<div class="card">${dumbbell()}</div>

<h2>Every query across scales</h2>
<p class="note">Each sample is a real execution of the public query, called as the focal user with a fresh identity token, so the query cache never answers. Documents read and server time come from the backend's function log stream. Bands show the bootstrap 95% CI of the median.</p>
<div class="grid-cases">${smallMultiples}</div>

<h2>Statistics</h2>
<p class="note">Speed-up = median before ÷ median after. p is a two-sided Mann–Whitney U test on server time, Holm–Bonferroni-adjusted across all ${tests.length} comparisons. Cliff's δ is the effect size (1 = every after sample is faster than every before sample).</p>
${statsTable()}

<h2>Seeded data</h2>
<p class="note">Rows per table at each scale (before run). Per-team, per-repo and per-user fan-outs scale with N; per-entity fan-outs scale for the focal entity only.</p>
${datasetTable(before)}
<div id="tip"></div>
</div>
<script>
const tip=document.getElementById('tip');
document.addEventListener('pointermove',e=>{const g=e.target.closest&&e.target.closest('[data-tip]');if(!g){tip.style.display='none';return}tip.textContent=g.getAttribute('data-tip');tip.style.display='block';const x=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8);tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px'});
</script>
</body></html>`;

const out = path.join(RESULTS_DIR, `${flags.out}.html`);
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
