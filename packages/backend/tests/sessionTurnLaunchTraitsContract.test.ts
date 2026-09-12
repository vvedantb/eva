import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

/** Source with `//` comments stripped — the prose names the very identifiers
 * these tests assert are absent, so an assertion over the raw text would match
 * the comment instead of the code. */
const source = (path: string): string =>
  readFileSync(join(testsDir, path), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/^\s*\/\/.*$/gm, "");

const executionSource = readFileSync(
  join(testsDir, "../convex/_sessions/execution.ts"),
  "utf8",
).replaceAll("\r\n", "\n");

/**
 * `stageAndStartSessionTurn`'s body with `//` comments stripped — the prose
 * names the very identifiers these tests assert are absent, so an assertion
 * over the raw text would match the comment instead of the code.
 */
const stageBody = (() => {
  const startAt = executionSource.indexOf(
    "async function stageAndStartSessionTurn(",
  );
  expect(
    startAt,
    "stageAndStartSessionTurn moved or was renamed",
  ).toBeGreaterThan(-1);
  const nextAt = executionSource.indexOf("\nexport ", startAt + 1);
  return executionSource
    .slice(startAt, nextAt < 0 ? undefined : nextAt)
    .replace(/^\s*\/\/.*$/gm, "");
})();

/** Every index at which `anchor` occurs in `text`. */
function anchorIndexes(text: string, anchor: string): readonly number[] {
  const found: number[] = [];
  for (
    let at = text.indexOf(anchor);
    at > -1;
    at = text.indexOf(anchor, at + 1)
  ) {
    found.push(at);
  }
  return found;
}

/** The `{ … }` object literal that starts after `from`, brace-matched. */
function braceBlock(text: string, from: number): string {
  expect(from, "the anchor this block hangs off is gone").toBeGreaterThan(-1);
  const open = text.indexOf("{", from);
  expect(open, "no object literal follows the call").toBeGreaterThan(-1);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  throw new Error("unbalanced braces");
}

const RAW_TRAIT_ARGS: readonly string[] = [
  "params.reasoningLevel",
  "params.thinkingEnabled",
  "params.use1mContext",
  "params.fastMode",
];

/** What the task/project composers send straight into their `startExecute`. */
const RAW_COMPOSER_ARGS: readonly string[] = [
  "args.reasoningLevel",
  "args.thinkingEnabled",
  "args.use1mContext",
  "args.fastMode",
];

/**
 * Session 166: the composer sends a model default explicitly (reasoning "high"
 * is Fable's default, and its display value), so forwarding `params.*` verbatim
 * gave this turn's prewarm and the workflow's prewarm a daemon opts sig of
 * `…|high|…` where the page-open prewarm — which normalises through
 * `launchTraitsFromStored` — had `…||…`. The second prewarm then logged
 * "model/tools changed" and kill+relaunched the daemon the first had just
 * booted: 65 respawns against 146 launches in 24h.
 *
 * The fix is one normalisation, before both launch call sites. It is invisible
 * at runtime, so pin it.
 */
describe("stageAndStartSessionTurn normalises launch traits once", () => {
  const normaliseAt = stageBody.indexOf("launchTraitsFromStored(");
  const prewarmAt = stageBody.indexOf("internal.sandbox.prewarmSessionDaemon");
  const workflowStartAt = stageBody.indexOf("workflow.start(");

  test("both launch call sites are still here", () => {
    expect(prewarmAt, "the turn prewarm scheduler call moved").toBeGreaterThan(
      -1,
    );
    expect(workflowStartAt, "the workflow start moved").toBeGreaterThan(-1);
    expect(
      stageBody.slice(workflowStartAt),
      "the workflow start must be sessionExecuteWorkflow",
    ).toContain("internal.sessionWorkflow.sessionExecuteWorkflow");
  });

  test("the traits are normalised before either call site", () => {
    expect(
      normaliseAt,
      "launchTraitsFromStored is the single helper every prewarm must agree on",
    ).toBeGreaterThan(-1);
    expect(normaliseAt).toBeLessThan(prewarmAt);
    expect(normaliseAt).toBeLessThan(workflowStartAt);
    expect(executionSource).toContain("launchTraitsFromStored");
  });

  test("neither call site forwards a raw composer trait", () => {
    const prewarmArgs = stageBody.slice(prewarmAt, workflowStartAt);
    const workflowArgs = stageBody.slice(workflowStartAt);
    for (const arg of RAW_TRAIT_ARGS) {
      expect(
        prewarmArgs,
        `${arg} reaches the turn prewarm unnormalised`,
      ).not.toContain(arg);
      expect(
        workflowArgs,
        `${arg} reaches the workflow, which forwards it to prewarmSessionDaemon`,
      ).not.toContain(arg);
    }
  });

  test("the normalised traits are what both call sites spread", () => {
    expect(stageBody.slice(prewarmAt, workflowStartAt)).toContain(
      "...launchTraits",
    );
    expect(stageBody.slice(workflowStartAt)).toContain("...launchTraits");
  });
});

const occurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1;

/**
 * `stageAndStartSessionTurn` is not the only door into a chat workflow, and
 * every one of these workflows forwards whatever traits it is given straight
 * back into its `prewarm*Daemon`. The queue drains read the composer's enqueued
 * values (same display-value override as the send path), the orchestrator
 * wake-up reads the sticky `last*` fields, and the task/project `startExecute`
 * mutations read the composer's args — all raw. Every door has to normalise, or
 * the warm daemon dies on that path instead.
 */
describe("every chat workflow start normalises its launch traits", () => {
  const doors: Array<{
    label: string;
    path: string;
    /** Workflow ref, specific enough to pick this door out of a file that
     * starts several different workflows (the queue helpers start three). */
    anchor: string;
    /** Entity id the args must still carry, so the slice is the right one. */
    entityField: string;
    /** How the normalised traits reach the args: inlined helper call, or a
     * spread of the `launchTraits` the handler computed once, above. */
    spread: string;
    rawFields: readonly string[];
  }> = [
    {
      label: "the session queued-message drain",
      path: "../convex/_queues/helpers.ts",
      anchor: "internal.sessionWorkflow.sessionExecuteWorkflow",
      entityField: "sessionId",
      spread: "launchTraitsFromStored(",
      rawFields: [
        "next.reasoningLevel",
        "next.thinkingEnabled",
        "next.use1mContext",
        "next.fastMode",
      ],
    },
    {
      label: "the orchestrator wake-up",
      path: "../convex/orchestratorNotify.ts",
      anchor: "internal.sessionWorkflow.sessionExecuteWorkflow",
      entityField: "sessionId",
      spread: "launchTraitsFromStored(",
      rawFields: [
        "master.lastReasoningLevel",
        "master.lastThinkingEnabled",
        "master.lastUse1mContext",
        "master.lastFastMode",
      ],
    },
    {
      label: "the task chat queued-message drain",
      path: "../convex/_queues/helpers.ts",
      anchor: "internal.agentTaskChatWorkflow.agentTaskChatExecuteWorkflow",
      entityField: "taskId",
      spread: "launchTraitsFromStored(",
      rawFields: [
        "next.reasoningLevel",
        "next.thinkingEnabled",
        "next.use1mContext",
        "next.fastMode",
      ],
    },
    {
      label: "the project chat queued-message drain",
      path: "../convex/_queues/helpers.ts",
      anchor: "internal.projectChatWorkflow.projectChatExecuteWorkflow",
      entityField: "projectId",
      spread: "launchTraitsFromStored(",
      rawFields: [
        "next.reasoningLevel",
        "next.thinkingEnabled",
        "next.use1mContext",
        "next.fastMode",
      ],
    },
    {
      label: "the task chat send path",
      path: "../convex/agentTaskChatWorkflow.ts",
      anchor: "internal.agentTaskChatWorkflow.agentTaskChatExecuteWorkflow",
      entityField: "taskId",
      spread: "...launchTraits",
      rawFields: RAW_COMPOSER_ARGS,
    },
    {
      label: "the project chat send path",
      path: "../convex/projectChatWorkflow.ts",
      anchor: "internal.projectChatWorkflow.projectChatExecuteWorkflow",
      entityField: "projectId",
      spread: "...launchTraits",
      rawFields: RAW_COMPOSER_ARGS,
    },
  ];

  for (const { label, path, anchor, entityField, spread, rawFields } of doors) {
    describe(label, () => {
      const text = source(path);
      // Every occurrence, not just the first: a file may grow a second start
      // through the same door, and that one has to normalise too.
      // Brace-matched rather than indentation-matched, so reformatting or
      // moving a call deeper into a `try` cannot widen the slice.
      const argsList = anchorIndexes(text, anchor).map((at) =>
        braceBlock(text, at),
      );

      test("the workflow start is still here", () => {
        expect(
          argsList.length,
          `${anchor} moved or was renamed`,
        ).toBeGreaterThan(0);
        for (const args of argsList) expect(args).toContain(entityField);
      });

      test("normalisation happens before the start", () => {
        expect(
          text.indexOf("launchTraitsFromStored("),
          "launchTraitsFromStored is the single helper every launch path shares",
        ).toBeGreaterThan(-1);
        expect(argsList.length).toBeGreaterThan(0);
        for (const args of argsList) expect(args).toContain(spread);
      });

      test("no raw trait field reaches the workflow args", () => {
        expect(argsList.length).toBeGreaterThan(0);
        for (const args of argsList) {
          // A raw field inside the launchTraitsFromStored( argument IS the
          // normalisation; anywhere else in the args it is forwarded
          // unnormalised. Doors that spread a precomputed `launchTraits` hold
          // no helper call here, so every raw field must be absent.
          const helperAt = args.indexOf("launchTraitsFromStored(");
          const helperArgs = helperAt < 0 ? "" : braceBlock(args, helperAt);
          for (const field of rawFields) {
            expect(
              occurrences(args, field),
              `${field} is forwarded to the workflow outside launchTraitsFromStored`,
            ).toBe(occurrences(helperArgs, field));
          }
        }
      });
    });
  }
});

/**
 * The send path prewarms the daemon itself, one scheduler tick before the
 * workflow starts and prewarms it again. Both have to agree with the page-open
 * prewarm's sig, so this call site needs the same normalisation the workflow
 * args got — otherwise the turn's own prewarm kills the page-open daemon. Task
 * and project chat stage every turn (composer send and usage-limit retry)
 * through one helper each, so that helper is where the normalisation lives.
 */
describe("each chat staging helper prewarms with normalised traits", () => {
  const handlers: Array<{ label: string; path: string; helper: string }> = [
    {
      label: "task chat",
      path: "../convex/agentTaskChatWorkflow.ts",
      helper: "async function stageAndStartTaskChatTurn(",
    },
    {
      label: "project chat",
      path: "../convex/projectChatWorkflow.ts",
      helper: "async function stageAndStartProjectChatTurn(",
    },
  ];

  for (const { label, path, helper } of handlers) {
    describe(label, () => {
      const text = source(path);
      const handlerAt = text.indexOf(helper);
      const nextExportAt = text.indexOf("\nexport ", handlerAt + 1);
      const body = text.slice(
        handlerAt,
        nextExportAt < 0 ? undefined : nextExportAt,
      );
      const normaliseAt = body.indexOf("launchTraitsFromStored(");
      const prewarmAt = body.indexOf("internal.sandbox.prewarmEntityDaemon");
      const workflowStartAt = body.indexOf("workflow.start(");

      test("the staging helper still prewarms and starts a workflow", () => {
        expect(handlerAt, `${helper} moved or was renamed`).toBeGreaterThan(-1);
        expect(
          prewarmAt,
          "the turn prewarm scheduler call moved",
        ).toBeGreaterThan(-1);
        expect(workflowStartAt, "the workflow start moved").toBeGreaterThan(-1);
      });

      test("the traits are normalised before either call site", () => {
        expect(
          normaliseAt,
          "launchTraitsFromStored is the single helper every prewarm must agree on",
        ).toBeGreaterThan(-1);
        expect(normaliseAt).toBeLessThan(prewarmAt);
        expect(normaliseAt).toBeLessThan(workflowStartAt);
      });

      test("the prewarm spreads the normalised traits, raw args reach neither", () => {
        const prewarmArgs = braceBlock(body, prewarmAt);
        expect(prewarmArgs).toContain("...launchTraits");
        for (const arg of [...RAW_COMPOSER_ARGS, ...RAW_TRAIT_ARGS]) {
          expect(
            prewarmArgs,
            `${arg} reaches the turn prewarm unnormalised`,
          ).not.toContain(arg);
        }
      });
    });
  }
});
