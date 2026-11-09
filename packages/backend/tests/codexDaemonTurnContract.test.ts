import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const codexDaemonSource = readSource(
  "callback-src/providers/codexAppServerDaemon.ts",
);
const claudeDaemonSource = readSource(
  "callback-src/providers/claudeSdkDaemon.ts",
);
const claimedTurnLifecycleSource = readSource(
  "callback-src/providers/claimedTurnLifecycle.ts",
);
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

/**
 * Both surfaces have to hold every invariant below: the callback source is what
 * gets reviewed, the generated bundle is what actually runs in the sandbox, and
 * a stale bundle ships the old behaviour no matter how the source reads.
 */
const surfaces: [string, string][] = [
  ["callback source", codexDaemonSource],
  ["deployed bundle", bundledScript],
];

const DISCARD_LOG =
  "claim discarded while real turn active (prompt lost; pendingTurn was already cleared)";

/**
 * claimPendingTurn clears the prompt server-side, so the daemon's only choices
 * are park or discard. A mid-turn claim of the SAME durable turn is the
 * workflow re-staging the prompt this turn is already running — parking it
 * replays the same prompt a second time once the turn ends (fix 9e939568).
 * A follow-up send during finalizing is a different turn and must be parked
 * (session 65 stalled when that claim was discarded with a live 2-minute lease).
 */
describe("a same-turn restage is discarded; a follow-up turn is parked", () => {
  test.each(surfaces)("the park goes through routeClaimedTurn (%s)", (_l, source) => {
    const block = codexClaimHandling(source);
    const parkAt = block.indexOf(".parkClaim(claimedTurn)");
    expect(parkAt, "the park moved out of the claim router").toBeGreaterThan(
      block.indexOf("routeClaimedTurn({"),
    );
  });

  test.each(surfaces)("no unguarded park survives (%s)", (_label, source) => {
    // One park site only: a second, ungated one is the regression itself.
    expect(occurrences(codexClaimHandling(source), "parkClaim(")).toBe(1);
  });

  test("the shared router logs the discard, not silent", () => {
    expect(claimedTurnLifecycleSource).toContain(DISCARD_LOG);
    expect(bundledScript).toContain(DISCARD_LOG);
  });

  test.each(surfaces)("idle is the only phase that accepts a turn (%s)", (_l, source) => {
    expect(source).toContain("acceptTurn");
    expect(source).toContain('supervisor.phase === "idle"');
  });

  test("the claude daemon still carries the semantics codex mirrors", () => {
    expect(claudeDaemonSource).toContain("routeClaimedTurn(");
    expect(claudeDaemonSource).toContain("acceptTurn");
  });
});

/**
 * An awaited interrupt stalls the claim loop for the whole request timeout, and
 * a rejected one tore the daemon down. The turn settles on `turn/completed`
 * either way, so the interrupt is fire-and-forget with a swallowed failure.
 */
describe("a codex cancel interrupt cannot stall or kill the claim loop", () => {
  test.each(surfaces)("the interrupt is not awaited (%s)", (_label, source) => {
    const interruptAt = source.indexOf('"turn/interrupt"');
    expect(interruptAt, "the interrupt request moved").toBeGreaterThan(-1);
    const beforeCall = source.slice(Math.max(0, interruptAt - 60), interruptAt);
    expect(beforeCall).toContain("void client");
    expect(beforeCall).not.toContain("await client");
  });

  test.each(surfaces)("its failure is swallowed (%s)", (_label, source) => {
    const interruptAt = source.indexOf('"turn/interrupt"');
    expect(source.slice(interruptAt, interruptAt + 400)).toContain(".catch(");
  });
});

/**
 * `turn/completed` carries no usage at codex 0.146.0; per-turn usage is the
 * delta of the cumulative `thread/tokenUsage/updated` totals. computeTurnUsage
 * Delta is unit-tested in callback-src/tests — these guard its two wiring bugs.
 */
describe("codex per-turn usage survives its notification stream", () => {
  test.each(surfaces)(
    "the turn-start baseline is snapshotted before the request (%s)",
    (_label, source) => {
      // Usage notifications for a turn can land ahead of the turn/start
      // response, so a snapshot taken after it would already count this turn.
      const startTurnAt = source.indexOf("async function startTurn(");
      expect(startTurnAt, "startTurn moved").toBeGreaterThan(-1);
      const snapshotAt = source.indexOf(
        "turnStartUsage = threadTotalUsage",
        startTurnAt,
      );
      const requestAt = source.indexOf('"turn/start"', startTurnAt);
      expect(snapshotAt, "the usage baseline snapshot moved").toBeGreaterThan(
        -1,
      );
      expect(requestAt, "the turn/start request moved").toBeGreaterThan(-1);
      expect(snapshotAt).toBeLessThan(requestAt);
    },
  );

  test.each(surfaces)(
    "a malformed tokenUsage keeps the last known totals (%s)",
    (_label, source) => {
      // An empty `total` object used to overwrite the running totals, which
      // finalized the turn as an all-zeros usage event (fix 4de00bca).
      const block = tokenUsageHandling(source);
      const guardAt = block.indexOf("Object.keys(total).length > 0");
      const assignAt = block.indexOf("threadTotalUsage = total");
      expect(guardAt, "the empty-total guard is gone").toBeGreaterThan(-1);
      expect(assignAt, "the totals assignment moved").toBeGreaterThan(guardAt);
      expect(occurrences(source, "threadTotalUsage = total")).toBe(1);
      expect(source).not.toContain("threadTotalUsage = objectValue");
    },
  );
});

/** The codex claim handler, from its claim read through the router call. */
function codexClaimHandling(source: string): string {
  const startAt = source.indexOf("const claimedTurn = readClaimedTurn");
  expect(startAt, "the codex claim read moved").toBeGreaterThan(-1);
  const routeAt = source.indexOf("routeClaimedTurn({", startAt);
  expect(routeAt, "the codex claim router moved").toBeGreaterThan(-1);
  const endAt = source.indexOf("});", routeAt);
  expect(endAt, "the codex claim router call moved").toBeGreaterThan(routeAt);
  return source.slice(startAt, endAt);
}

/** The `thread/tokenUsage/updated` branch of processNotification. */
function tokenUsageHandling(source: string): string {
  const notifyAt = source.indexOf('"thread/tokenUsage/updated"');
  expect(notifyAt, "the tokenUsage notification branch moved").toBeGreaterThan(
    -1,
  );
  const endAt = source.indexOf(
    "normalizeAppServerNotification(notification)",
    notifyAt,
  );
  expect(
    endAt,
    "the tokenUsage branch no longer precedes normalize",
  ).toBeGreaterThan(notifyAt);
  return source.slice(notifyAt, endAt);
}

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
