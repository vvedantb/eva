// Load test runner. For each scale it boots a fresh, isolated local Convex
// backend, pushes this checkout's functions, seeds deterministic data, then
// probes every case in CASES as the focal user and records server-side
// execution stats from the deployment's function log stream.
//
//   cd packages/backend
//   node loadtest/run.ts --label before [--scales 1,10,100,1000] [--samples 30]
//
// Results go to loadtest/results/<label>.json. See loadtest/README.md.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
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
  sleep,
  stopBackend,
} from "./backend.ts";
import { CASES } from "./cases.ts";
import type { CallQuery, SeedRefs } from "./cases.ts";
import { mulberry32 } from "./stats.ts";
import { resultsFileSchema } from "./schema.ts";
import type { CaseResult, ResultsFile, Sample, ScaleResult } from "./schema.ts";

const { values: flags } = parseArgs({
  options: {
    label: { type: "string", default: "run" },
    scales: { type: "string", default: "1,10,100,1000" },
    samples: { type: "string", default: "30" },
    warmup: { type: "string", default: "3" },
    only: { type: "string" },
  },
});
const SCALES = flags.scales.split(",").map(Number);
const SAMPLES = Number(flags.samples);
const WARMUP = Number(flags.warmup);
const ONLY = flags.only ? new Set(flags.only.split(",")) : null;
const cases = CASES.filter((c) => !ONLY || ONLY.has(c.name));

// ---------------------------------------------------------------------------
// Probing

const logEntrySchema = z.object({
  kind: z.string(),
  udfType: z.string().nullish(),
  identifier: z.string().nullish(),
  caller: z.string().nullish(),
  cachedResult: z.boolean().nullish(),
  executionTime: z.number().nullish(),
  userExecutionTime: z.number().nullish(),
  error: z.string().nullable().optional(),
  returnBytes: z.number().nullable().optional(),
  usageStats: z
    .object({
      databaseReadBytes: z.number(),
      databaseReadDocuments: z.number(),
      memoryUsedMb: z.number(),
    })
    .nullish(),
});
const logPageSchema = z.object({ entries: z.array(logEntrySchema), newCursor: z.number() });
type LogEntry = z.infer<typeof logEntrySchema>;

class LogStream {
  private cursor = 0;
  private readonly adminKey: string;
  constructor(adminKey: string) {
    this.adminKey = adminKey;
  }

  private async page(): Promise<z.infer<typeof logPageSchema>> {
    const res = await fetch(`${URL}/api/stream_function_logs?cursor=${this.cursor}`, {
      headers: { Authorization: `Convex ${this.adminKey}` },
    });
    return logPageSchema.parse(await res.json());
  }

  async skipToEnd() {
    this.cursor = (await this.page()).newCursor;
  }

  /** Completed public query executions since the last call, in order. */
  async drainQueries(expected: number): Promise<Array<LogEntry>> {
    const out: Array<LogEntry> = [];
    for (let attempt = 0; attempt < 40 && out.length < expected; attempt++) {
      const page = await this.page();
      this.cursor = page.newCursor;
      for (const entry of page.entries) {
        if (entry.kind === "Completion" && entry.udfType === "Query" && entry.caller === "HttpApi") {
          out.push(entry);
        }
      }
      if (out.length < expected) await sleep(100);
    }
    return out;
  }
}

function firstLine(message: string): string {
  const cleaned = message.replace(/^\[Request ID: [^\]]+\] Server Error\s*/, "");
  return cleaned.split("\n").find((line) => line.trim() !== "")?.trim() ?? cleaned;
}

async function probeScale(client: AdminClient, adminKey: string, refs: SeedRefs) {
  const logs = new LogStream(adminKey);
  await logs.skipToEnd();
  const results = new Map<string, CaseResult>(
    cases.map((c) => [c.name, { name: c.name, surface: c.surface, samples: [] }]),
  );
  const rand = mulberry32(42);
  let nonce = 0;

  for (let round = 0; round < WARMUP + SAMPLES; round++) {
    // Shuffle per round so drift (GC, compaction, crons) spreads evenly.
    const order = [...cases].sort(() => rand() - 0.5);
    const pending: Array<{ name: string; identifier: string; clientMs: number; error: string | null }> = [];
    for (const queryCase of order) {
      // A fresh token identifier per call defeats the query cache, so every
      // sample is a real execution. `subject` still resolves the focal user.
      nonce++;
      const identity = {
        subject: "loadtest_focal_user",
        issuer: FOCAL_IDENTITY_ISSUER,
        tokenIdentifier: `${FOCAL_IDENTITY_ISSUER}|loadtest_focal_user|${nonce}`,
      };
      const call: CallQuery = (query, args) => client.call("query", query, args, identity);
      const started = performance.now();
      let error: string | null = null;
      try {
        await queryCase.run(call, refs);
      } catch (e) {
        error = firstLine(e instanceof Error ? e.message : String(e));
      }
      pending.push({ name: queryCase.name, identifier: queryCase.functionName, clientMs: performance.now() - started, error });
    }
    const callsDone = performance.now();
    const entries = await logs.drainQueries(pending.length);
    const drainMs = performance.now() - callsDone;
    if (round < WARMUP) continue;
    pending.forEach((p, index) => {
      const entry = entries[index];
      const matched = entry?.identifier === p.identifier ? entry : undefined;
      const sample: Sample = {
        clientMs: p.clientMs,
        serverMs: typeof matched?.executionTime === "number" ? matched.executionTime * 1000 : null,
        userMs: typeof matched?.userExecutionTime === "number" ? matched.userExecutionTime * 1000 : null,
        docsRead: matched?.usageStats?.databaseReadDocuments ?? null,
        bytesRead: matched?.usageStats?.databaseReadBytes ?? null,
        returnBytes: matched?.returnBytes ?? null,
        memoryMb: matched?.usageStats?.memoryUsedMb ?? null,
        cached: matched?.cachedResult ?? null,
        error: p.error,
      };
      results.get(p.name)?.samples.push(sample);
    });
    const callMs = pending.reduce((sum, p) => sum + p.clientMs, 0);
    process.stdout.write(`  round ${round + 1 - WARMUP}/${SAMPLES} (calls ${(callMs / 1000).toFixed(1)}s, log drain ${(drainMs / 1000).toFixed(1)}s)\r`);
  }
  process.stdout.write("\n");
  return [...results.values()];
}

// ---------------------------------------------------------------------------


async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const { adminKey, instanceSecret } = readInstanceCredentials();
  const gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: BACKEND_ROOT }).toString().trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "convex"], { cwd: BACKEND_ROOT }).toString().trim() !== "";
  const output: ResultsFile = {
    label: flags.label,
    gitSha: dirty ? `${gitSha}+dirty` : gitSha,
    startedAt: new Date().toISOString(),
    samplesPerCase: SAMPLES,
    warmupRounds: WARMUP,
    scales: [],
  };
  try {
    for (const scale of SCALES) {
      console.log(`\n== scale ${scale}x`);
      await freshBackend(instanceSecret);
      await pushFunctions(adminKey);
      const client = new AdminClient(URL, adminKey);
      const seedStarted = performance.now();
      const now = Date.UTC(2026, 10, 1);
      const { refs, tables } = await seed(client, scale, now);
      const seedMs = performance.now() - seedStarted;
      const seedDocs = Object.values(tables).reduce((sum, n) => sum + n, 0);
      console.log(`  seeded ${seedDocs} docs in ${(seedMs / 1000).toFixed(1)}s`);
      const caseResults = await probeScale(client, adminKey, refs);
      const scaleResult: ScaleResult = { scale, samples: SAMPLES, seedMs, seedDocs, tableCounts: tables, cases: caseResults };
      output.scales.push(scaleResult);
      for (const c of caseResults) {
        const failures = c.samples.filter((s) => s.error).length;
        const docs = c.samples.find((s) => s.docsRead !== null)?.docsRead;
        console.log(`  ${c.name.padEnd(40)} docs=${String(docs ?? "?").padStart(7)} ${failures ? `FAIL(${failures}) ${c.samples.find((s) => s.error)?.error ?? ""}` : ""}`);
      }
      writeResults(output);
    }
  } finally {
    stopBackend();
  }
}

/** Merges into an existing file for the label, replacing re-run scales. */
function writeResults(output: ResultsFile) {
  const dir = path.join(BACKEND_ROOT, "loadtest/results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${output.label}.json`);
  const previous = fs.existsSync(file)
    ? resultsFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))).scales
    : [];
  const rerun = new Set(output.scales.map((s) => s.scale));
  const merged: ResultsFile = {
    ...output,
    scales: [...previous.filter((s) => !rerun.has(s.scale)), ...output.scales].sort(
      (a, b) => a.scale - b.scale,
    ),
  };
  fs.writeFileSync(file, JSON.stringify(resultsFileSchema.parse(merged), null, 1));
  console.log(`  wrote ${path.relative(BACKEND_ROOT, file)}`);
}

await main();
