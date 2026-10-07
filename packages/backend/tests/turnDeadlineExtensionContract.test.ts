import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

const turnStore = convexSource("_chat/turnStore.ts");
const runCompletion = convexSource("_taskWorkflow/publicMutations.ts");
const execution = convexSource("_sandbox_runtime/execution.ts");
const provider = convexSource("_sandbox/provider.ts");
const vercelProvider = convexSource("_sandbox/vercelProvider.ts");

/**
 * Vercel's `timeout` is a hard per-session runtime cap, not an idle timer. A
 * turn that outlives it is killed mid-work with NO snapshot, and the next
 * resume rolls the filesystem back to the pre-turn state — so the user loses
 * the work AND the evidence (observed twice in prod on 2026-08-06: a 59-minute
 * cursor turn on task 213, and session 53 the same morning).
 *
 * Every live turn slides the deadline from its lease renewal (see the next
 * block). A quick-task run also keeps working after its agent exits (push, PR,
 * deployment tracking) with nobody renewing, so its completion pushes the
 * deadline past the whole finalizing lease.
 */
describe("a run keeps its sandbox deadline ahead of its post-agent steps", () => {
  test("a run completion extends the deadline past the finalizing lease", () => {
    const startAt = runCompletion.indexOf("export const handleCompletion");
    expect(startAt, "handleCompletion moved or was renamed").toBeGreaterThan(
      -1,
    );
    const body = runCompletion.slice(
      startAt,
      runCompletion.indexOf("\n});", startAt),
    );
    const advanceAt = body.indexOf('advanceTurn(ctx, turn.turn, "finalizing")');
    const extendAt = body.indexOf("internal.sandbox.extendSandboxDeadline");
    expect(advanceAt).toBeGreaterThan(-1);
    expect(extendAt).toBeGreaterThan(advanceAt);
    expect(
      body.slice(extendAt),
      "two finalizing leases keep the deadline ahead of a late PR step",
    ).toMatch(/durationMs:\s*2\s*\*\s*TURN_FINALIZING_LEASE_MS/);
  });

  /**
   * Best-effort by contract: this runs on the hot path of every live turn, and
   * a provider hiccup here must never be what fails the turn.
   */
  test("extendSandboxDeadline swallows its own failures", () => {
    const startAt = execution.indexOf("export const extendSandboxDeadline");
    expect(
      startAt,
      "extendSandboxDeadline moved or was renamed",
    ).toBeGreaterThan(-1);
    const nextAt = execution.indexOf("\nexport ", startAt + 1);
    const body = execution.slice(startAt, nextAt < 0 ? undefined : nextAt);
    expect(body).toContain("try {");
    expect(
      body,
      "a failed extension must not propagate into the lease renewal",
    ).toContain("} catch (error) {");
    expect(body).toContain("sandbox.extendTimeout(args.durationMs)");
    // Getting a handle does not exec, so this must not be able to wake a
    // stopped sandbox the user deliberately stopped.
    expect(body).not.toContain("resumeAfterStop");
  });

  test("extendTimeout is part of the provider contract", () => {
    expect(provider).toContain(
      "extendTimeout(durationMs: number): Promise<void>",
    );
    expect(vercelProvider).toContain("async extendTimeout(durationMs: number)");
  });

  /**
   * The create-time cap (below) is already the plan ceiling, and Vercel 400s any
   * extension that would pass it. So an unconditional ask is a guaranteed
   * rejection for the ~24h the deadline is far away — one scheduled action and
   * one error line every 30s for the whole length of a live turn (prod,
   * 2026-08-19). The gate is what makes the ask rare AND meaningful: only when
   * the deadline falls inside the window the caller asked to keep clear.
   */
  test("the deadline is only pushed when it is actually near", () => {
    const startAt = vercelProvider.indexOf(
      "async extendTimeout(durationMs: number)",
    );
    const body = vercelProvider.slice(
      startAt,
      vercelProvider.indexOf("\n  async ", startAt + 1),
    );
    expect(
      body,
      "the gate must read the live session deadline, not a local guess",
    ).toContain("this.sandbox.expiresAt");
    expect(
      body.match(/expiresAt\s*-\s*Date\.now\(\)\s*>\s*durationMs/),
      "skip only while the deadline is further out than the window the caller wants covered",
    ).not.toBeNull();
    expect(
      body,
      "a near-deadline failure is the one worth reading, so it must carry the API body",
    ).toContain("extractApiErrorDetail(e)");
  });
});

/**
 * A durable turn's lease is its only stall check (decision 2), so the lease
 * renewal is also what keeps a live turn's sandbox deadline ahead of it.
 * Renewals are throttled to one write per half lease; the extension rides on
 * that write, so it costs one scheduled action per minute of a live turn.
 */
describe("a durable turn slides its sandbox deadline from the lease", () => {
  const renewAt = turnStore.indexOf("export async function renewTurnLease(");
  const renew = turnStore.slice(
    renewAt,
    turnStore.indexOf("\nexport ", renewAt + 1),
  );

  test("only a written renewal extends the deadline", () => {
    expect(renewAt, "renewTurnLease moved or was renamed").toBeGreaterThan(-1);
    const throttleAt = renew.indexOf("shouldWriteTurnLeaseRenewal(");
    const writeAt = renew.indexOf("await ctx.db.patch(turn._id,");
    const extendAt = renew.indexOf("internal.sandbox.extendSandboxDeadline");
    expect(throttleAt, "the renewal throttle moved").toBeGreaterThan(-1);
    expect(
      extendAt,
      "a live durable turn must push the provider's hard runtime cap out",
    ).toBeGreaterThan(writeAt);
    expect(writeAt).toBeGreaterThan(throttleAt);
  });

  test("the extension covers more than one renewal interval", () => {
    const args = renew.slice(
      renew.indexOf("internal.sandbox.extendSandboxDeadline"),
    );
    const duration = args
      .slice(0, args.indexOf("}"))
      .match(/durationMs:\s*durationMs\s*\*\s*(\d+)/);
    expect(
      duration,
      "the extension must be expressed in lease lengths, so retuning the lease cannot outrun it",
    ).not.toBeNull();
    expect(Number(duration?.[1]), "one lease of slack is none").toBeGreaterThan(
      1,
    );
  });
});

/**
 * The sliding deadline above only helps once a watchdog has ticked. The cap the
 * sandbox is BORN with is a separate number, and it is the one that killed turns
 * in prod: `autoStopMinutes` is an idle-stop budget in eva's neutral lifecycle
 * vocabulary, but Vercel spends it as a hard runtime cap, so mapping it straight
 * through turns a short idle budget into a mid-turn kill. It was raised twice in
 * one day chasing exactly that (45 min -> 4 h in e1231f6c, 4 h -> 24 h in
 * 1cca6aa5), which is what makes the floor worth pinning rather than the value.
 */
describe("a sandbox is created with a cap longer than a long turn", () => {
  const FLOOR =
    /timeout:\s*Math\.max\(\s*params\.lifecycle\.autoStopMinutes,\s*([^)]+)\)([^,\n]*)/;

  /** "24 * 60" -> 1440. Guards the parse so a reshaped expression cannot read as NaN. */
  function minutes(expression: string): number {
    const parts = expression.split("*").map((part) => Number(part.trim()));
    for (const part of parts) {
      expect(
        Number.isFinite(part) && part > 0,
        `the floor is no longer a product of numbers: ${expression}`,
      ).toBe(true);
    }
    return parts.reduce((total, part) => total * part, 1);
  }

  test("the mapping floors autoStopMinutes instead of passing it through", () => {
    expect(
      vercelProvider,
      "a caller's short idle budget must not become the hard runtime cap",
    ).toMatch(FLOOR);
  });

  /**
   * The lower bound, not the current value — raising the cap must stay free.
   * Both shipped regressions sat under this line (45 and 90 minutes) and both
   * killed real turns, so anything back in that range fails here.
   */
  test("the floor leaves room for a long seed build or agent turn", () => {
    const floor = vercelProvider.match(FLOOR);
    expect(floor, "the create-time timeout mapping moved").not.toBeNull();
    expect(
      minutes(floor?.[1] ?? ""),
      "a cap this short kills long turns mid-work, with no snapshot",
    ).toBeGreaterThanOrEqual(4 * 60);
  });

  /**
   * The quiet one: eva counts minutes, the Vercel field takes milliseconds. A
   * dropped factor reads as a healthy-looking 24 and hard-kills every sandbox
   * 24 minutes in, which looks like a crash rather than a cap.
   */
  test("the floored minutes are converted to milliseconds", () => {
    const floor = vercelProvider.match(FLOOR);
    expect(floor?.[2] ?? "", "minutes -> ms conversion changed").toContain(
      "* 60 * 1000",
    );
  });
});
