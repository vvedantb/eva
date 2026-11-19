// Output equivalence check: seeds one dataset, runs every case on the old
// code, pushes the new code onto the same data, runs every case again and
// diffs the results. A query fix must not change what any query returns.
//
//   node loadtest/compare.ts --old-dir /path/to/old/packages/backend [--scale 10]
//
// The old dir needs `convex/_loadTest/` (copy it in) and node_modules.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AdminClient } from "./client.ts";
import {
  BACKEND_ROOT,
  FOCAL_IDENTITY_ISSUER,
  URL,
  WORK_DIR,
  freshBackend,
  pushFunctions,
  readInstanceCredentials,
  seed,
  stopBackend,
} from "./backend.ts";
import { CASES } from "./cases.ts";
import type { CallQuery, SeedRefs } from "./cases.ts";

const { values: flags } = parseArgs({
  options: {
    "old-dir": { type: "string" },
    scale: { type: "string", default: "10" },
  },
});
const oldDirFlag = flags["old-dir"];
if (!oldDirFlag) throw new Error("--old-dir is required");
const oldDir: string = oldDirFlag;

type Outcome = { ok: true; json: string } | { ok: false; error: string };

async function runAll(client: AdminClient, refs: SeedRefs): Promise<Map<string, Outcome>> {
  const identity = {
    subject: "loadtest_focal_user",
    issuer: FOCAL_IDENTITY_ISSUER,
    tokenIdentifier: `${FOCAL_IDENTITY_ISSUER}|loadtest_focal_user|compare`,
  };
  const call: CallQuery = (query, args) => client.call("query", query, args, identity);
  const out = new Map<string, Outcome>();
  for (const c of CASES) {
    try {
      out.set(c.name, { ok: true, json: JSON.stringify(await c.run(call, refs)) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.set(c.name, { ok: false, error: message.split("\n").find((l) => l.includes("Error")) ?? message });
    }
  }
  return out;
}

/** First differing character, with context, for a readable report line. */
function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: old …${a.slice(Math.max(0, i - 60), i + 60)}… new …${b.slice(Math.max(0, i - 60), i + 60)}…`;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const { adminKey, instanceSecret } = readInstanceCredentials();
  const scale = Number(flags.scale);
  try {
    await freshBackend(instanceSecret);
    console.log(`push old code from ${oldDir}`);
    await pushFunctions(adminKey, path.resolve(oldDir));
    const client = new AdminClient(URL, adminKey);
    const { refs } = await seed(client, scale, Date.UTC(2026, 10, 1));
    const before = await runAll(client, refs);
    console.log(`push new code from ${BACKEND_ROOT}`);
    await pushFunctions(adminKey);
    const after = await runAll(client, refs);
    let mismatches = 0;
    for (const c of CASES) {
      const b = before.get(c.name);
      const a = after.get(c.name);
      if (!b || !a) continue;
      const same = b.ok && a.ok ? b.json === a.json : !b.ok && !a.ok;
      if (same) {
        console.log(`  same   ${c.name}${b.ok ? ` (${b.json.length} chars)` : " (both error)"}`);
        continue;
      }
      mismatches++;
      const detail = b.ok && a.ok ? firstDiff(b.json, a.json) : `old ${b.ok ? "ok" : b.error} / new ${a.ok ? "ok" : a.error}`;
      console.log(`  DIFF   ${c.name}: ${detail}`);
    }
    console.log(`\n${mismatches} of ${CASES.length} queries changed output at ${scale}×`);
    process.exitCode = mismatches ? 1 : 0;
  } finally {
    stopBackend();
  }
}

await main();
