import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const PW_CORE = (
  process.env.PW_CORE ||
  "C:/Users/vedan/AppData/Roaming/npm/node_modules/agent-browser/node_modules/playwright-core/index.js"
).replace(/\\/g, "/");
const pw = await import(`file:///${PW_CORE}`);
const { chromium } = pw.default;

const ROOT = "C:/Vedant/Personal/GitHub/eva";
const SKILL = `${ROOT}/.claude/skills/eva-feature-screenshot`;
const ICON = `${ROOT}/apps/web/public/icon.svg`;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const slug = arg("--slug");
const title = arg("--title", "Eva");
if (!slug) {
  console.error("hd-frame: --slug is required");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const raw = arg("--raw", `${ROOT}/screenshots/${today}-${slug}.png`).replace(
  /\\/g,
  "/",
);
if (!existsSync(raw)) {
  console.error(`hd-frame: no such screenshot: ${raw}`);
  process.exit(1);
}
const out = raw.replace(/\.png$/, "-framed.png");

const tpl = readFileSync(`${SKILL}/templates/frame.html`, "utf-8");
const html = tpl
  .replaceAll("__IMG__", `file:///${raw}`)
  .replaceAll("__ICON__", `file:///${ICON}`)
  .replaceAll("__TITLE__", title);

const pageFile = `${ROOT}/screenshots/.frame-${slug}.html`;
writeFileSync(pageFile, html, "utf-8");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(`file:///${pageFile}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: out, scale: "device" });
await browser.close();
rmSync(pageFile, { force: true });

console.log(`framed: ${out}`);
