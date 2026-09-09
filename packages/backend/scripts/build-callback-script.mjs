import * as esbuild from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const entry = join(backendRoot, "callback-src/index.ts");
const outJs = join(backendRoot, "callback-src/.build/bundle.js");
const outTs = join(
  backendRoot,
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);
const callbackTsconfig = join(backendRoot, "callback-src/tsconfig.json");

// Fail the bundle if callback-src doesn't typecheck — esbuild alone won't
// catch missing imports (the cc8d1eed / unlinkSync production outage).
const typecheck = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsc", "--noEmit", "-p", callbackTsconfig],
  { cwd: backendRoot, encoding: "utf8", shell: process.platform === "win32" },
);
if (typecheck.status !== 0) {
  if (typecheck.stdout) process.stderr.write(typecheck.stdout);
  if (typecheck.stderr) process.stderr.write(typecheck.stderr);
  console.error("callback-src typecheck failed; refusing to bundle");
  process.exit(typecheck.status ?? 1);
}

mkdirSync(dirname(outJs), { recursive: true });
mkdirSync(dirname(outTs), { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: outJs,
  logLevel: "info",
});

const bundled = readFileSync(outJs, "utf8");
// Control bytes (effect's source embeds a few) become \xNN escapes so the
// generated file stays plain text for git and the sourceEncoding test; the
// template literal evaluates them back to the original bytes at runtime.
const escaped = bundled
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$/g, "\\$")
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (ch) => {
    return "\\x" + ch.charCodeAt(0).toString(16).padStart(2, "0");
  });

writeFileSync(
  outTs,
  `"use node";\n\nexport const CALLBACK_SCRIPT = \`${escaped}\`.trim();\n`,
  "utf8",
);

console.log("Wrote", outTs, "(" + bundled.length, "bytes bundled)");
