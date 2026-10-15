import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const CALL = "prepareSandboxSteps(step";
const DELETE = "internal.sandbox.deleteSandbox";

/**
 * A workflow that asks for `ephemeral: true` owns the VM it gets: nothing else
 * holds a reference to it, no session row points at it, and the idle auto-stop
 * only ever stops a sandbox — it never deletes one. So the workflow either
 * deletes it or that VM lingers until the provider reaps it, billing the whole
 * time (fix dae150ba, which found PR recap doing exactly this).
 *
 * The rule is per call site rather than per file because `ephemeral` is a
 * required argument: every new caller has to answer the question, and this test
 * makes the answer binding.
 */
describe("every ephemeral sandbox is torn down by the workflow that made it", () => {
  const sites = prepareSandboxSites();

  /**
   * The inventory. A new call site fails here first, which is the point: it has
   * to be classified deliberately, not inherit whichever default the file it
   * was pasted into happened to use.
   */
  test("the full set of call sites is accounted for", () => {
    // Compared as a sorted set: the scan walks files in directory order, so a
    // call site moving between files (or a new file sorting earlier) reordered
    // this list and failed the test with no call site having changed at all.
    // Membership and classification are what this pins; order means nothing.
    expect(
      sites.map((site) => `${site.id} ephemeral=${site.ephemeral}`).sort(),
    ).toEqual(
      [
        "arenaBrowserWorkflow.ts::arenaBrowserWorkflow ephemeral=true",
        "automationWorkflow.ts::automationExecutionWorkflow ephemeral=true",
        "docInterviewWorkflow.ts::docInterviewWorkflow ephemeral=false",
        "docInterviewWorkflow.ts::docGenerateWorkflow ephemeral=false",
        "evaluationWorkflow.ts::evaluationWorkflow ephemeral=true",
        "evaluationWorkflow.ts::fixWorkflow ephemeral=true",
        "prRecapWorkflow.ts::prRecapWorkflow ephemeral=true",
        "summarizeWorkflow.ts::summarizeSessionWorkflow ephemeral=false",
        "testGenWorkflow.ts::testGenWorkflow ephemeral=true",
        "_taskWorkflow/workflowDefinition.ts::taskExecutionWorkflow ephemeral=false",
      ].sort(),
    );
  });

  /** Both classes have to be populated or the rules below prove nothing. */
  test("the scan found both kinds of caller", () => {
    expect(sites.filter((site) => site.ephemeral).length).toBeGreaterThan(2);
    expect(sites.filter((site) => !site.ephemeral).length).toBeGreaterThan(2);
  });

  /**
   * In a `finally`, not on the success path and again in the catch. The
   * duplicated form works only as long as nobody adds an early return between
   * the launch and the teardown, and the whole failure mode here is a teardown
   * that silently stops running.
   */
  test.each(ephemeralIds())("%s deletes its sandbox in a finally", (id) => {
    const site = siteById(id);
    expect(site.finallyBlock, `${id} no longer has a finally`).not.toBe("");
    expect(
      site.finallyBlock,
      `${id} creates an ephemeral sandbox and never deletes it`,
    ).toContain(DELETE);
  });

  /**
   * A throwing cleanup inside a `finally` replaces the error the workflow was
   * already reporting, so the user sees "sandbox delete failed" instead of the
   * reason their run failed.
   */
  test.each(ephemeralIds())("%s treats the delete as best-effort", (id) => {
    const block = siteById(id).finallyBlock;
    const deleteAt = block.indexOf(DELETE);
    const tryAt = block.lastIndexOf("try {", deleteAt);
    expect(tryAt, `${id} does not guard its cleanup delete`).toBeGreaterThan(
      -1,
    );
    expect(
      block.indexOf("catch", deleteAt),
      `${id} has no catch after the cleanup delete`,
    ).toBeGreaterThan(-1);
  });

  /**
   * The other direction, and the reason this is not just "always delete":
   * a persistent sandbox belongs to the session or project that outlives the
   * workflow. Deleting one destroys a live environment mid-conversation — those
   * paths stop the VM instead (see the session stop-recovery contract).
   */
  test.each(persistentIds())(
    "%s does not delete a persistent sandbox",
    (id) => {
      expect(
        siteById(id).definition,
        `${id} passes ephemeral: false but deletes the sandbox anyway`,
      ).not.toContain(DELETE);
    },
  );

  function siteById(id: string): PrepareSandboxSite {
    const site = sites.find((candidate) => candidate.id === id);
    expect(site, `${id} moved or was renamed`).toBeDefined();
    if (site === undefined) throw new Error(`missing site ${id}`);
    return site;
  }

  function ephemeralIds(): string[] {
    return sites.filter((site) => site.ephemeral).map((site) => site.id);
  }

  function persistentIds(): string[] {
    return sites.filter((site) => !site.ephemeral).map((site) => site.id);
  }
});

type PrepareSandboxSite = {
  /** `<file>::<exported definition>`, stable enough to name in a failure. */
  id: string;
  ephemeral: boolean;
  /** The whole exported definition the call sits in. */
  definition: string;
  /** Everything from `} finally {` to the end of the definition, or "". */
  finallyBlock: string;
};

/**
 * Every `prepareSandboxSteps` call in the Convex tree, paired with the exported
 * workflow definition that contains it. Definitions are sliced on column-zero
 * `export const`, which is how these files are laid out.
 */
function prepareSandboxSites(): PrepareSandboxSite[] {
  const sites: PrepareSandboxSite[] = [];

  for (const file of convexSources()) {
    const raw = readFileSync(file, "utf8").replaceAll("\r\n", "\n");
    if (!raw.includes(CALL)) continue;

    const source = stripComments(raw);
    const bounds = [...source.matchAll(/\nexport const (\w+)/g)];
    const relative = file.slice(convexDir.length + 1).replaceAll("\\", "/");

    for (const [index, bound] of bounds.entries()) {
      const definition = source.slice(
        bound.index,
        bounds[index + 1]?.index ?? source.length,
      );
      if (!definition.includes(CALL)) continue;

      const finallyAt = definition.indexOf("} finally {");
      for (const ephemeral of ephemeralFlags(definition)) {
        sites.push({
          id: `${relative}::${bound[1]}`,
          ephemeral,
          definition,
          finallyBlock: finallyAt < 0 ? "" : definition.slice(finallyAt),
        });
      }
    }
  }

  return sites;
}

/**
 * The `ephemeral` value of each call in a definition, in source order. Read
 * forward from the call rather than by parsing the object literal: the flag is
 * always the caller's own, and a missing one cannot typecheck.
 */
function ephemeralFlags(definition: string): boolean[] {
  const flags: boolean[] = [];
  let at = definition.indexOf(CALL);
  while (at > -1) {
    const match = /ephemeral:\s*(true|false)/.exec(definition.slice(at));
    expect(
      match,
      "a prepareSandboxSteps call passes no ephemeral flag",
    ).not.toBe(null);
    flags.push(match?.[1] === "true");
    at = definition.indexOf(CALL, at + 1);
  }
  return flags;
}

/**
 * Sorted, because `readdirSync` returns filesystem order: the inventory below
 * is an exact list, so an unsorted walk made it pass on one machine and fail on
 * another with the same nine call sites in a different order.
 */
function convexSources(): string[] {
  const walk = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir).toSorted()) {
      if (entry === "_generated") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...walk(full));
      else if (entry.endsWith(".ts")) found.push(full);
    }
    return found;
  };
  return walk(convexDir);
}

/** Comments name the very calls these rules rule out, so they have to go first. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
