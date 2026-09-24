import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const sandboxExecution = readSource("convex/_sandbox_runtime/execution.ts");
const sandboxHeal = readSource("convex/sandboxHeal.ts");

/**
 * The preview readiness poll fires every ~2s per open page and used to run
 * the background-daemon heal (several sandbox execs + log lines) on every
 * tick, flooding prod logs. The heal is now claimed through a per-sandbox
 * rate-limit slot. It must stay a rate limit — not a probe-failure gate —
 * because the app port can serve while a background daemon (local convex,
 * supabase) is dead, which is exactly the case the heal exists for.
 */
describe("the preview heal is rate-limited per sandbox", () => {
  test("the heal runs only after winning the claim", () => {
    // `getPreviewUrl`'s body lives in `buildPreviewUrl`, shared with the MCP
    // get_preview_url path — so the poll rules are pinned where they run.
    const body = functionBody(
      sandboxExecution,
      "async function buildPreviewUrl(",
    );
    const stateGuardAt = body.indexOf('handle.state !== "running"');
    const claimAt = body.indexOf("internal.sandboxHeal.claim");
    const healAt = body.indexOf("internal.sandbox.runBackgroundCommands");
    expect(stateGuardAt, "the non-running guard moved").toBeGreaterThan(-1);
    expect(claimAt, "the heal claim moved").toBeGreaterThan(-1);
    expect(healAt, "the heal call moved").toBeGreaterThan(-1);
    // Never exec (or claim) on a stopped sandbox — on Vercel any exec resumes
    // a stopped VM (see prewarmNeverResurrects contract).
    expect(stateGuardAt).toBeLessThan(claimAt);
    expect(claimAt).toBeLessThan(healAt);
    expect(body).toContain("if (healClaimed)");
  });

  test("the claim is an interval check, not a readiness gate", () => {
    const body = definitionBody(sandboxHeal, "claim");
    expect(body).toContain("BG_HEAL_MIN_INTERVAL_MS");
    expect(body).not.toContain("ready");
    const interval = sandboxHeal.match(/BG_HEAL_MIN_INTERVAL_MS = ([\d_]+)/);
    expect(interval, "the interval constant moved").not.toBeNull();
    const ms = Number((interval?.[1] ?? "0").replaceAll("_", ""));
    // The point is fewer execs without letting dead daemons linger: keep the
    // interval in the 30-60s band.
    expect(ms).toBeGreaterThanOrEqual(30_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  test("the claim skips a session that is still launching its services", () => {
    const body = definitionBody(sandboxHeal, "claim");
    const rateLimitAt = body.indexOf("BG_HEAL_MIN_INTERVAL_MS");
    const rateLimitReturnAt = body.indexOf("return false", rateLimitAt);
    const sessionQueryAt = body.indexOf('.query("sessions")');
    const pendingAt = body.indexOf("sandboxServicesPending === true");
    const patchAt = body.indexOf("ctx.db.patch(stamp._id, { lastHealAt");
    const insertAt = body.indexOf('ctx.db.insert("sandboxHealStamps"');
    expect(rateLimitReturnAt, "the rate-limit bail-out moved").toBeGreaterThan(
      -1,
    );
    expect(sessionQueryAt, "the session lookup moved").toBeGreaterThan(-1);
    expect(pendingAt, "the services-pending gate moved").toBeGreaterThan(-1);
    expect(patchAt, "the stamp patch moved").toBeGreaterThan(-1);
    expect(insertAt, "the stamp insert moved").toBeGreaterThan(-1);
    expect(
      body.indexOf('.withIndex("by_sandbox"', sessionQueryAt),
    ).toBeGreaterThan(sessionQueryAt);
    // After the rate limit: a healthy sandbox pays one session-row read per
    // interval, not one per ~2s poll.
    expect(rateLimitReturnAt).toBeLessThan(sessionQueryAt);
    // Before either stamp write: the gate must not consume the interval slot,
    // so the first poll after final-ready heals immediately.
    const stampAt = Math.min(patchAt, insertAt);
    expect(pendingAt).toBeLessThan(stampAt);
    const gateReturnAt = body.indexOf("return false", pendingAt);
    expect(gateReturnAt, "the gate stopped bailing out").toBeGreaterThan(-1);
    expect(gateReturnAt).toBeLessThan(stampAt);
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
