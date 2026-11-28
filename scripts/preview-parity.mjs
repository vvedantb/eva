/**
 * Keeps the preview card and comments drawer that the proxy injects into a
 * direct sandbox link the same as Eva's own React ones.
 *
 *   pnpm preview:parity                 measure both, fail on any difference
 *   pnpm preview:parity --write-theme   also re-measure Eva's tokens and rewrite
 *                                       the direct-link fallback palette
 *
 * Needs the web dev server (default http://localhost:5173, or WEB_URL) and the
 * `agent-browser` CLI. Run it from `/preflight`; CI has no browser.
 *
 * Real side: the `/dev/preview-parity` route renders `AnnotationCommentCard` and
 * `PreviewCommentsDrawer` with fixed data. Injected side: the built bundle on a
 * mock page, against a stub of the preview-comments API with the same data.
 */
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backend = join(root, "packages/backend");
const bundlePath = join(backend, "preview-annotation-src/.build/bundle.js");
const themeOut = join(backend, "preview-annotation-src/themeFallback.generated.ts");
const WEB = process.env.WEB_URL ?? "http://localhost:5173";
const writeTheme = process.argv.includes("--write-theme");
const THEMES = [
  { name: "light", cls: "light", media: "light" },
  { name: "dark", cls: "dark neutral", media: "dark" },
];

const verbose = process.env.PARITY_VERBOSE === "1";
function ab(...args) {
  if (verbose) console.error("agent-browser", args.join(" ").slice(0, 100));
  return new Promise((resolve, reject) => {
    execFile("agent-browser", args, { encoding: "utf8", maxBuffer: 1 << 24 }, (error, stdout) => {
      if (error && error.code === "ENOENT") reject(new Error("agent-browser is not installed"));
      else resolve(stdout.trim());
    });
  });
}
async function evalJson(js) {
  const raw = await ab("eval", js);
  if (!raw) throw new Error(`The page returned nothing for: ${js.slice(0, 60)}`);
  const first = JSON.parse(raw.split("\n").at(-1));
  return typeof first === "string" ? JSON.parse(first) : first;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MEASURE = String.raw`(() => {
  const PX = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginBottom','fontSize','lineHeight','letterSpacing','borderTopWidth','columnGap'];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { g.clearRect(0,0,1,1); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0,0,1,1); return [...g.getImageData(0,0,1,1).data].join(','); };
  const m = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el); const o = {};
    for (const k of PX) o[k] = parseFloat(s[k]) || 0;
    o.fontWeight = s.fontWeight;
    o.radius = parseFloat(s.borderTopLeftRadius) > 500 ? 'pill' : parseFloat(s.borderTopLeftRadius);
    o.color = rgba(s.color); o.background = rgba(s.backgroundColor);
    o.border = o.borderTopWidth > 0 ? rgba(s.borderTopColor) : 'none';
    return o;
  };
  const first = (root, sel) => root.querySelector(sel);
  const text = (root, sel, t) => [...root.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(t));
  const out = {};
  if (document.querySelector('[data-testid=preview-comments-drawer]')) {
    const card = [...document.querySelectorAll('div')].find((d) => d.querySelector('textarea') && d.className.includes('smooth-shadow-ring-lg'));
    const drawer = document.querySelector('[data-testid=preview-comments-drawer]');
    const item = [...drawer.querySelectorAll('div')].find((d) => d.className.includes('smooth-shadow-ring') && d.textContent.includes('darker blue'));
    Object.assign(out, {
      card: m(card), chipRow: m(first(card, '.mb-2.flex')), chipMono: m(first(card, 'span.font-mono')), chipText: m(first(card, '.italic')),
      a11y: m(first(card, 'p')), textarea: m(first(card, 'textarea')), cancel: m(text(card, 'button', 'Cancel')), primary: m(text(card, 'button', 'Send to Eva')),
      drawer: m(drawer), head: m(text(drawer, 'span', 'Comments')), tabsTrack: m(first(drawer, '[role=tablist]')), tabIdle: m(first(drawer, '[role=tab][data-state=inactive]')),
      item: m(item), itemChip: m(first(item, 'span.font-mono')), itemTime: m(first(item, '.tabular-nums')), feedback: m(first(item, 'p')),
      reply: m(first(item, '.bg-muted')), replyTitle: m(first(item, '.bg-muted p')), replyBody: m(first(item, '.bg-muted p:last-child')),
      resolve: m(text(item, 'button', 'Resolve')), view: m(text(item, 'button', 'View in chat')),
      queued: m(text(drawer, 'p', 'Queued')),
    });
  } else {
    const hosts = [...document.querySelectorAll('[data-eva-annotate-overlay]')].filter((e) => e.shadowRoot);
    const card = hosts.find((h) => h.shadowRoot.querySelector('textarea')).shadowRoot;
    const drawer = hosts.find((h) => h.shadowRoot.querySelector('.drawer')).shadowRoot;
    const item = drawer.querySelector('.item');
    Object.assign(out, {
      card: m(first(card, '.card')), chipRow: m(first(card, '.chips')), chipMono: m(first(card, '.chip.mono')), chipText: m(first(card, '.text')),
      a11y: m(first(card, '.a11y')), textarea: m(first(card, 'textarea')), cancel: m(text(card, 'button', 'Cancel')), primary: m(text(card, 'button', 'Send to Eva')),
      drawer: m(first(drawer, '.drawer')), head: m(first(drawer, '.head span')), tabsTrack: m(first(drawer, '.seg')), tabIdle: m(first(drawer, '.seg button[aria-pressed=false]')),
      item: m(item), itemChip: m(first(item, '.chip')), itemTime: m(first(item, '.time')), feedback: m(first(item, '.feedback')),
      reply: m(first(item, '.reply')), replyTitle: m(first(item, '.reply b')), replyBody: m(first(item, '.reply p')),
      resolve: m(text(item, 'button', 'Resolve')), view: m(text(item, 'button', 'View in chat')),
      queued: m(first(drawer, '.queued')),
    });
  }
  return JSON.stringify(out);
})()`;

const IGNORE = new Set([
  "tabIdle.paddingTop",
  "tabIdle.paddingBottom",
]);

function compare(theme, real, injected) {
  const diffs = [];
  for (const [key, r] of Object.entries(real)) {
    const i = injected[key];
    if (!r) { diffs.push(`${theme} ${key}: missing on the Eva side (selector drift?)`); continue; }
    if (!i) { diffs.push(`${theme} ${key}: missing on the injected side`); continue; }
    for (const [prop, rv] of Object.entries(r)) {
      if (IGNORE.has(`${key}.${prop}`)) continue;
      const iv = i[prop];
      const bothNum = typeof rv === "number" && typeof iv === "number";
      const same = bothNum ? Math.abs(rv - iv) <= (prop === "letterSpacing" ? 0.03 : 0.5) : rv === iv;
      if (!same) diffs.push(`${theme} ${key}.${prop}: Eva ${rv}  injected ${iv}`);
    }
  }
  return diffs;
}

function serve() {
  const now = Date.now();
  const comments = [
    { kind: "message", id: "m1", feedback: "Give this button more padding and a darker blue", element: "<button.btn-primary>", pagePath: "/", timestamp: now - 120000, reply: { status: "done", excerpt: "I increased the padding to 14px 24px and changed the background to blue-700." } },
    { kind: "message", id: "m2", feedback: "Make the heading smaller", element: "<h1.title>", pagePath: "/", timestamp: now - 3600000, reply: { status: "working" } },
    { kind: "queued", id: "q1", feedback: "Add a cancel button next to Save", element: "<div.actions>", pagePath: "/", timestamp: now - 30000 },
  ];
  const page = `<!doctype html><html><body style="margin:0;font-family:Inter,system-ui"><div style="padding:24px"><button class="btn-primary" aria-label="Save changes" style="padding:10px 18px;border-radius:8px;border:0;background:#2563eb;color:#fff">Save changes</button></div><script src="/bundle.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type" };
    if (req.method === "OPTIONS") { res.writeHead(200, cors); res.end(); return; }
    if (req.url === "/bundle.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(bundlePath)); return; }
    if (req.url?.startsWith("/__eva_preview_proxy/eva-comments")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: "t", site: `http://127.0.0.1:${server.address().port}`, view: "https://eva.test/o/r/sessions/1" }));
      return;
    }
    if (req.method === "POST") {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify(req.url?.endsWith("/list") ? { comments } : { ok: true }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" }); res.end(page);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function measureReal(theme) {
  await ab("set", "media", theme.media);
  await ab("open", `${WEB}/dev/preview-parity`);
  for (let n = 0; n < 40; n++) {
    if (await evalJson("JSON.stringify(!!document.querySelector('[data-testid=preview-comments-drawer]'))")) break;
    await sleep(500);
  }
  await ab("eval", `document.documentElement.className = '${theme.cls}'`);
  await sleep(600);
  return await evalJson(MEASURE);
}

async function measureInjected(theme, origin) {
  await ab("set", "media", theme.media);
  await ab("open", `${origin}/`);
  await sleep(1200);
  await ab("eval", "localStorage.setItem('eva-preview-toolbar', JSON.stringify({left: 1100, top: 500, expanded: true}))");
  await ab("open", `${origin}/`);
  await sleep(1500);
  const click = (label) => ab("eval", `document.querySelector('[data-eva-annotate-overlay]').shadowRoot.querySelector('button[aria-label="${label}"]').click()`);
  await click("Comments");
  await sleep(1200);
  await click("Select element");
  await ab("mouse", "move", "60", "40"); await ab("mouse", "down"); await ab("mouse", "up");
  await sleep(900);
  const result = await evalJson(MEASURE);
  await ab("eval", "localStorage.removeItem('eva-preview-toolbar')");
  return result;
}

function themeFile(themes) {
  const obj = (name, t) => `export const ${name}: ToolbarTheme = {\n${Object.entries(t).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n")}\n};`;
  return `// GENERATED by scripts/preview-parity.mjs --write-theme: do not edit by hand.
// Eva's resolved design tokens (light, and dark neutral), measured from the
// running app with \`readPreviewToolbarTheme\`. A direct sandbox link has no Eva
// to ask, so the injected toolbar, card and drawer use these.
import type { PreviewToolbarTheme as ToolbarTheme } from "@eva/shared/previewFrameMessages";

${obj("LIGHT_THEME", themes.light)}

${obj("DARK_THEME", themes.dark)}
`;
}

async function main() {
  try { execFileSync("curl", ["-sf", "-o", "/dev/null", WEB]); } catch { throw new Error(`The web dev server is not running at ${WEB}`); }
  await ab("set", "viewport", "1360", "560");
  await ab("open", `${WEB}/?agent`);
  await sleep(6000);

  if (writeTheme) {
    const themes = {};
    for (const theme of THEMES) {
      await ab("open", `${WEB}/dev/preview-parity`);
      await sleep(6000);
      await ab("eval", `document.documentElement.className = '${theme.cls}'`);
      await sleep(600);
      themes[theme.name] = await evalJson("JSON.stringify(window.evaPreviewParity.readTheme())");
    }
    writeFileSync(themeOut, themeFile(themes));
    console.log("Wrote", themeOut);
  }

  execFileSync("node", [join(backend, "scripts/build-annotation-script.mjs")], { stdio: "ignore" });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const diffs = [];
  try {
    for (const theme of THEMES) {
      const real = await measureReal(theme);
      const injected = await measureInjected(theme, origin);
      diffs.push(...compare(theme.name, real, injected));
    }
  } finally {
    server.close();
    await ab("set", "media", "light");
  }
  if (diffs.length > 0) {
    console.error(`Preview parity: ${diffs.length} difference(s)\n` + diffs.map((d) => `  ${d}`).join("\n"));
    console.error("\nFix the injected copy (packages/backend/preview-annotation-src), or run with --write-theme if only the colours moved.");
    process.exit(1);
  }
  console.log("Preview parity: the injected card and drawer match Eva's in light and dark.");
}

main().catch((error) => { console.error(error.message); process.exit(1); });
