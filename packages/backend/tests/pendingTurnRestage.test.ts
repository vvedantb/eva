import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { pendingTurnAlreadyClaimed } from "../convex/_chat/pendingTurnRestage";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Task and project chat have no `turns` row, so `ensurePendingTurn` could not
 * tell "the daemon claimed this prompt and is running it" from "a cancel raced
 * `startExecute` and wiped it": both leave no `pendingTurn` and an unfinished
 * assistant placeholder as the newest message. It re-staged mid-turn, and
 * because `shouldDeferDaemonRespawn` never defers while a prompt is staged, a
 * prewarm killed the daemon, the replacement claimed the duplicate, and one
 * user message ran twice in parallel (task m57bzd0wbdtnm57e2g4jfb17718b5yty,
 * 2026-09-02 13:11).
 */
describe("pendingTurnAlreadyClaimed", () => {
  const PLACEHOLDER_AT = 1_800_000_000_000;

  /** No daemon has ever claimed here, so an empty pendingTurn means cancel. */
  test("an unstamped entity is a cancel race, not a live claim", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: undefined,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(false);
  });

  /** A stamp from an older turn cannot vouch for this turn's placeholder. */
  test("a stamp older than the placeholder is stale", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT - 1,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(false);
  });

  test("a stamp after the placeholder means the turn is running", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT + 1,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(true);
  });

  /**
   * `startExecute` inserts the placeholder and stages the prompt in one
   * mutation, so a claim can land on the same millisecond as the placeholder.
   * Treating that as unclaimed would re-open the duplicate-run window.
   */
  test("a stamp equal to the placeholder counts as claimed", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(true);
  });
});

/**
 * The guard is only as good as the stamp. Each surface has exactly one claim
 * site and must stamp there; the re-stage must consult the shared helper rather
 * than growing its own copy of the rule.
 */
describe("both daemon-pull surfaces stamp and consult the claim", () => {
  const surfaces: Array<[string, string, string]> = [
    ["task chat", "_chat/taskChatDaemon.ts", "args.taskId"],
    ["project chat", "_chat/projectChatDaemon.ts", "args.projectId"],
  ];

  for (const [label, path, idArg] of surfaces) {
    test(`${label} stamps the claim as it hands out the prompt`, () => {
      const claim = definitionBody(readSource(path), "claimPendingTurn");
      const patchAt = claim.indexOf(`await ctx.db.patch(${idArg}, {`);
      expect(patchAt, "the handoff patch moved").toBeGreaterThan(-1);
      const patch = claim.slice(patchAt);
      expect(patch).toContain("pendingTurn: undefined");
      expect(patch).toContain("pendingTurnClaimedAt: Date.now()");
    });

    test(`${label} re-stages only when the prompt was not claimed`, () => {
      const restage = definitionBody(readSource(path), "ensurePendingTurn");
      expect(restage).toContain("pendingTurnAlreadyClaimed({");
      // The guard has to precede the re-stage write to be worth anything.
      expect(restage.indexOf("pendingTurnAlreadyClaimed({")).toBeLessThan(
        restage.indexOf("pendingTurn: {"),
      );
    });
  }

  test("the stamp is declared on the shared chat-daemon entity fields", () => {
    const fields = readSource("_validators/tableFields.ts");
    const chatDaemon = fields.slice(
      fields.indexOf("export const chatDaemonEntityFields = {"),
      fields.indexOf("export const agentTaskFields = {"),
    );
    expect(chatDaemon).toContain(
      "pendingTurnClaimedAt: v.optional(v.number())",
    );
  });

  /** A stamp that outlives its turn would suppress a genuine cancel re-stage. */
  test.each([
    ["task chat", "agentTaskChatWorkflow.ts"],
    ["project chat", "projectChatWorkflow.ts"],
  ])("%s clears the stamp when the turn finalizes", (_, path) => {
    const workflow = readSource(path);
    for (const name of ["saveResult", "handleCompletion"]) {
      expect(
        definitionBody(workflow, name),
        `${path} ${name} leaves the claim stamp behind`,
      ).toContain("pendingTurnClaimedAt: undefined");
    }
    // cancelExecution builds its patch field by field, so it clears the stamp
    // by assignment rather than in an object literal.
    expect(
      definitionBody(workflow, "cancelExecution"),
      `${path} cancelExecution leaves the claim stamp behind`,
    ).toContain("pendingTurnClaimedAt = undefined");
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
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

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
