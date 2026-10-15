import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const sessionPrompts = readSource("convex/_sessions/prompts.ts");
const completion = readSource("callback-src/runtime/completion.ts");
const claudeSdkDaemon = readSource("callback-src/providers/claudeSdkDaemon.ts");
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);
const taskChatPrompt = readSource("convex/_agentTasks/chatPrompt.ts");
const projectChatPrompt = readSource("convex/_projects/chatPrompt.ts");

/**
 * The end-of-turn harvest posts EVERY file left in the deliverable folders to
 * the chat. A recordings request came back as 4 videos plus 33 working
 * screenshots because the prompt named the folder without stating that
 * contract, and the agent parked its per-step verification captures there.
 */
describe("media folders are a documented deliverable contract", () => {
  test("the session prompt states everything left there is posted", () => {
    expect(sessionPrompts).toContain("DELIVERABLE-ONLY");
    // Working captures need a named home outside the harvested folders, or
    // agents will keep using the deliverable ones.
    expect(sessionPrompts).toContain("/tmp/checks/");
    expect(sessionPrompts).toContain(
      "exactly what the user asked for and nothing else",
    );
  });

  test("task chat and project chat inherit the same deliverable contract", () => {
    // Both surfaces build their turn prompt through the session's
    // buildEditPrompt, so the DELIVERABLE-ONLY clause and the managed
    // dev-server section apply automatically — no separate copy to drift.
    expect(taskChatPrompt).toContain("buildEditPrompt(");
    expect(projectChatPrompt).toContain("buildEditPrompt(");
  });

  test("task chat and project chat forward their own dev port", () => {
    // buildEditPrompt renders "its configured dev port" when devPort is
    // undefined — a quiet regression if either surface stopped threading it.
    const taskBody = functionBody(
      taskChatPrompt,
      "export function buildAgentTaskChatPrompt(",
    );
    expect(taskBody).toContain("args.devPort,");
    const projectBody = functionBody(
      projectChatPrompt,
      "export function buildProjectChatPrompt(",
    );
    expect(projectBody).toContain("args.devPort,");
  });
});

/**
 * Agents also re-capture the same frame (retry loops, double screenshots), so
 * the harvest skips byte-identical files within a turn.
 */
describe("the harvest deduplicates identical captures", () => {
  test.each([
    ["callback source", completion],
    ["deployed bundle", bundledScript],
  ])("byte-identical files upload once (%s)", (_label, source) => {
    const at = source.indexOf("async function uploadAndAttachSandboxMedia(");
    expect(at, "the harvest moved").toBeGreaterThan(-1);
    const body = source.slice(at, source.indexOf("\n}", at));
    expect(body).toContain("sha256");
    // The digest gate must run before the upload.
    const gateAt = body.indexOf("isDuplicate");
    const uploadAt = body.indexOf("uploadMediaFile(");
    expect(gateAt, "the dedupe gate moved").toBeGreaterThan(-1);
    expect(uploadAt, "the upload moved").toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(uploadAt);
  });
});

/**
 * Posted deliverables must survive the harvest: agents reuse them in later
 * turns (PR/Linear embeds) instead of recapturing. Posted files move into
 * `.posted/`; only failed uploads stay at the top level so the next turn's
 * harvest retries them — deleting on failure destroyed the only copy.
 */
describe("the harvest archives posted files instead of deleting them", () => {
  test.each([
    ["callback source", completion],
    ["deployed bundle", bundledScript],
  ])(
    "posted files move to .posted, none are unlinked (%s)",
    (_label, source) => {
      const at = source.indexOf("async function uploadAndAttachSandboxMedia(");
      expect(at, "the harvest moved").toBeGreaterThan(-1);
      const body = source.slice(at, source.indexOf("\n}", at));
      expect(body).toContain("archivePostedFile(");
      expect(body).not.toContain("unlinkSync(");
    },
  );

  test("the session prompt tells agents where posted captures live", () => {
    expect(sessionPrompts).toContain(".posted/");
  });
});

/**
 * A task run is not a chat turn: it writes no `messages` row, and a quick
 * task's sandbox stops once the run ends. The harvest used to return early
 * whenever RUN_ID was set, on the assumption a later chat turn would pick the
 * files up — so screenshots a run was asked for never reached the chat at all.
 * Run captures now attach to the run doc, which every surface renders from.
 */
describe("task runs harvest their captures onto the run", () => {
  test.each([
    ["callback source", completion],
    ["deployed bundle", bundledScript],
  ])("a run attaches media to the run doc (%s)", (_label, source) => {
    const body = functionBody(
      source,
      "async function uploadAndAttachSandboxMedia(",
    );
    // The early return that dropped every run capture.
    expect(body).not.toMatch(/if \(RUN_ID\) return;/);
    expect(body).toContain("attachRunMediaIfAny(");
    expect(source).toContain('"agentRuns:attachMedia"');
  });

  test.each([
    ["callback source", completion],
    ["deployed bundle", bundledScript],
  ])("a run harvests before it completes (%s)", (_label, source) => {
    const body = functionBody(
      source,
      "async function deliverCompletionWithMedia(",
    );
    // Completing a run hands control back to the task workflow, which pushes,
    // opens the PR and stops the sandbox — a harvest queued after that races
    // the teardown. A chat turn still harvests after, so the message exists.
    const runHarvestAt = body.indexOf(
      "if (RUN_ID) await uploadAndAttachSandboxMedia(",
    );
    const completionAt = body.indexOf("COMPLETION_MUTATION");
    const chatHarvestAt = body.indexOf(
      "if (!RUN_ID) await uploadAndAttachSandboxMedia(",
    );
    expect(runHarvestAt, "the run harvest is missing").toBeGreaterThan(-1);
    expect(chatHarvestAt, "the chat harvest is missing").toBeGreaterThan(-1);
    expect(runHarvestAt).toBeLessThan(completionAt);
    expect(completionAt).toBeLessThan(chatHarvestAt);
  });
});

/**
 * Background-agent continuations are synthetic turns with their own assistant
 * placeholder. They used to call the completion mutation directly, skipping
 * the only function that uploads deliverable files. The exact message id also
 * prevents a queued turn created by completion from stealing those captures.
 */
describe("synthetic Claude turns harvest media onto their own message", () => {
  test.each([
    ["callback source", claudeSdkDaemon],
    ["deployed bundle", bundledScript],
  ])("completion precedes an exact-target harvest (%s)", (_label, source) => {
    const body = functionBody(source, "async function finalizeSyntheticTurn(");
    const completionAt = body.indexOf("COMPLETE_SYNTHETIC_TURN_MUTATION");
    const harvestAt = body.indexOf(
      "await uploadAndAttachSandboxMedia({ messageId });",
    );
    expect(completionAt, "synthetic completion moved").toBeGreaterThan(-1);
    expect(harvestAt, "the synthetic media harvest is missing").toBeGreaterThan(
      -1,
    );
    expect(completionAt).toBeLessThan(harvestAt);
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
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
