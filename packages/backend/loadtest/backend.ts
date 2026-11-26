// Isolated load-test backend: lifecycle, code push and seeding. Shared by
// run.ts (benchmarks) and compare.ts (output equivalence).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { generateKeyPair, exportJWK } from "jose";
import { z } from "zod";
import { internal } from "../convex/_generated/api.js";
import type { AdminClient } from "./client.ts";
import { seedRefsSchema } from "./cases.ts";

export const BACKEND_ROOT = path.resolve(import.meta.dirname, "..");
export const WORK_DIR = "/tmp/eva-loadtest";
export const PORT = 3310;
export const URL = `http://127.0.0.1:${PORT}`;
export const FOCAL_IDENTITY_ISSUER = "https://loadtest.invalid";

// ---------------------------------------------------------------------------
// Isolated backend lifecycle

function findBackendBinary(): string {
  const root = "/vercel/.cache/convex/binaries";
  const home = path.join(process.env.HOME ?? "", ".cache/convex/binaries");
  for (const dir of [root, home]) {
    if (!fs.existsSync(dir)) continue;
    const versions = fs.readdirSync(dir).sort().reverse();
    for (const version of versions) {
      const bin = path.join(dir, version, "convex-local-backend");
      if (fs.existsSync(bin)) return bin;
    }
  }
  throw new Error("convex-local-backend binary not found; run `npx convex dev` once");
}

const localConfigSchema = z.object({ adminKey: z.string(), instanceSecret: z.string() });

/** Reuses the dev backend's instance secret so its admin key works here. */
export function readInstanceCredentials() {
  const file = path.join(BACKEND_ROOT, ".convex/local/default/config.json");
  return localConfigSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

async function waitForBackend(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await fetch(`${URL}/version`).then((r) => r.ok, () => false);
    if (ok) return;
    await sleep(250);
  }
  throw new Error("load-test backend did not start");
}

export function stopBackend() {
  const pidFile = path.join(WORK_DIR, "backend.pid");
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  fs.rmSync(pidFile);
}

export async function freshBackend(instanceSecret: string) {
  stopBackend();
  await sleep(500);
  fs.rmSync(path.join(WORK_DIR, "data"), { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK_DIR, "data"), { recursive: true });
  const log = fs.openSync(path.join(WORK_DIR, "backend.log"), "w");
  const child = spawn(
    findBackendBinary(),
    [
      "--port", String(PORT),
      "--site-proxy-port", String(PORT + 1),
      "--instance-name", "anonymous-agent",
      "--instance-secret", instanceSecret,
      "--local-storage", path.join(WORK_DIR, "data/storage"),
      "--disable-beacon",
      path.join(WORK_DIR, "data/db.sqlite3"),
    ],
    { detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  fs.writeFileSync(path.join(WORK_DIR, "backend.pid"), String(child.pid));
  await waitForBackend(60_000);
}

/**
 * Runs the Convex CLI against the load-test backend. The CLI rewrites
 * `.env.local` (CONVEX_URL) even with --env-file, so the dev file is
 * snapshotted and restored around every call.
 */
function convexCli(args: Array<string>, adminKey: string, projectDir = BACKEND_ROOT) {
  const envFile = path.join(WORK_DIR, ".env");
  fs.writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${URL}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`);
  const devEnv = path.join(projectDir, ".env.local");
  const saved = fs.existsSync(devEnv) ? fs.readFileSync(devEnv) : null;
  try {
    const [command, ...rest] = args;
    execFileSync("npx", ["convex", command ?? "dev", "--env-file", envFile, ...rest], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CONVEX_DEPLOYMENT: "" },
    });
  } finally {
    if (saved) fs.writeFileSync(devEnv, saved);
  }
}

/** Pushes `projectDir/convex` (default: this checkout) to the load-test backend. */
export async function pushFunctions(adminKey: string, projectDir = BACKEND_ROOT) {
  const { publicKey } = await generateKeyPair("ES256", { extractable: true });
  const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), kid: "loadtest", alg: "ES256", use: "sig" }] });
  convexCli(["env", "set", "EVA_LOAD_TEST", "1"], adminKey, projectDir);
  convexCli(["env", "set", "CLERK_JWT_ISSUER_DOMAIN", FOCAL_IDENTITY_ISSUER], adminKey, projectDir);
  convexCli(["env", "set", "SANDBOX_JWT_JWKS", "--", jwks], adminKey, projectDir);
  convexCli(["dev", "--once", "--typecheck", "disable"], adminKey, projectDir);
}

// ---------------------------------------------------------------------------
// Seeding

const planSchema = z.array(
  z.object({
    kind: z.enum(["teammates", "shellRepos", "sessions", "projects", "quickTasks", "docs", "automations", "focalMessages", "focalRuns", "focalTaskTimeline", "focalDocComments", "focalSessionPrs", "focalAutomationRuns", "routedThreads"]),
    unitsPerScale: z.number(),
    unitsPerChunk: z.number(),
  }),
);
const insertedSchema = z.record(z.string(), z.number());

export async function seed(client: AdminClient, scale: number, now: number) {
  const refs = seedRefsSchema.parse(await client.call("mutation", internal._loadTest.seed.setup, { now }));
  const plan = planSchema.parse(await client.call("query", internal._loadTest.seed.plan, {}));
  const tables: Record<string, number> = {};
  for (const { kind, unitsPerScale, unitsPerChunk } of plan) {
    const total = unitsPerScale * scale;
    const starts: Array<number> = [];
    for (let start = 0; start < total; start += unitsPerChunk) starts.push(start);
    // Inserts never read, so parallel chunks cannot conflict.
    await runPool(starts, 2, async (start) => {
      const count = Math.min(unitsPerChunk, total - start);
      const inserted = insertedSchema.parse(
        await client.call("mutation", internal._loadTest.seed.chunk, { kind, start, count, total, refs }),
      );
      for (const [table, n] of Object.entries(inserted)) tables[table] = (tables[table] ?? 0) + n;
    });
  }
  return { refs, tables };
}

async function runPool<T>(items: Array<T>, size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await work(item);
    }
  });
  await Promise.all(workers);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
