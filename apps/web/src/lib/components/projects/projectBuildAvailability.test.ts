import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const badgeSource = readFileSync(join(here, "ProjectPhaseBadge.tsx"), "utf8");
const projectsDir = join(here, "../../../routes/_repo/$owner/$repo/projects");
/** The header controls render here; their flags derive in the helpers. */
const detailSource = readFileSync(
  join(projectsDir, "_components/ProjectDetailHeaderActions.tsx"),
  "utf8",
);
const helpersSource = readFileSync(
  join(projectsDir, "_components/projectDetailHelpers.ts"),
  "utf8",
);

/**
 * Phase lists are plain data in a component module, so they are read as text
 * rather than imported — the module pulls in @eva/ui and icon packages that the
 * node test environment has no reason to load.
 */
function phaseList(name: string): string[] {
  const block = badgeSource.match(
    new RegExp(`${name}: ProjectPhase\\[\\] = \\[([^\\]]*)\\]`),
  );
  expect(block, `${name} moved or was renamed`).not.toBeNull();
  return [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

/** `phaseConfig` is `Record<ProjectPhase, …>`, so its keys ARE the union. */
function configuredPhases(): string[] {
  const startAt = badgeSource.indexOf("export const phaseConfig");
  expect(startAt, "phaseConfig moved or was renamed").toBeGreaterThan(-1);
  const body = badgeSource.slice(startAt, badgeSource.indexOf("\n};", startAt));
  return [...body.matchAll(/^ {2}(\w+): \{$/gm)].map((match) => match[1]);
}

const BUILDABLE = "BUILDABLE_PROJECT_PHASES";

/**
 * The header decided whether to offer "Build Project" by excluding draft and
 * finalized, which quietly meant every OTHER phase was buildable — so a merged
 * project still advertised a build it should never run (fix f5de7d4c). The gate
 * is now an allow-list, and an allow-list only holds if every phase is
 * classified, so the union is checked against it here.
 */
describe("build is offered only on phases that can still build", () => {
  it("the phase registry covers the whole union", () => {
    const configured = configuredPhases();
    // A scan that found nothing would satisfy the comparison below for free.
    expect(
      configured.length,
      "phaseConfig keys no longer parse",
    ).toBeGreaterThan(4);
    expect(
      [...phaseList("PROJECT_PHASES")].sort(),
      "a new phase reached the union without joining PROJECT_PHASES",
    ).toEqual([...configured].sort());
  });

  it("every buildable phase is also a live phase", () => {
    const active = phaseList("ACTIVE_PROJECT_PHASES");
    const buildable = phaseList(BUILDABLE);
    expect(buildable.length).toBeGreaterThan(0);
    expect(
      buildable.filter((phase) => !active.includes(phase)),
      "a phase cannot be buildable without being active",
    ).toEqual([]);
  });

  /**
   * The four settled phases. `completed` is the one the bug was reported on —
   * its badge reads "Merged" — and `cancelled` is the same shape; draft and
   * finalized are still pre-build, as the original gate had it.
   */
  it("settled and pre-build phases are excluded", () => {
    const buildable = phaseList(BUILDABLE);
    for (const phase of ["draft", "finalized", "completed", "cancelled"]) {
      expect(buildable, `${phase} must not offer a build`).not.toContain(phase);
    }
  });

  it("in-flight phases keep their build", () => {
    const buildable = phaseList(BUILDABLE);
    for (const phase of ["in_progress", "business_review", "code_review"]) {
      expect(buildable, `${phase} lost its build`).toContain(phase);
    }
  });
});

/**
 * The list is only as good as the one place that reads it. The regression shape
 * is a header that goes back to reasoning about phases inline — the start and
 * stop controls both have to sit behind the shared allow-list, or a merged
 * project can still be told to build.
 */
describe("the project header reads the allow-list", () => {
  it("derives its gate from BUILDABLE_PROJECT_PHASES", () => {
    expect(helpersSource).toContain(
      `const canBuildProject = ${BUILDABLE}.includes(project.phase)`,
    );
  });

  it("gates both the build and stop-build controls on it", () => {
    const gateAt = detailSource.indexOf("{flags.canBuildProject ? (");
    const buildAt = detailSource.indexOf("<SplitBuildButton");
    // Anchor the stop control on its aria-label, not its visible "Stop Build"
    // text: the header's prose above the gate names the button too, and
    // matching that comment read as a regression while the gate was intact.
    const stopAt = detailSource.indexOf('aria-label="Stop build"');
    expect(gateAt, "the build gate moved").toBeGreaterThan(-1);
    expect(buildAt, "the build button moved").toBeGreaterThan(gateAt);
    expect(stopAt, "the stop-build button moved").toBeGreaterThan(gateAt);
  });

  /** The exact reasoning the fix replaced: draft/finalized as the only exclusion. */
  it("does not fall back to the draft-or-finalized test", () => {
    const gateAt = detailSource.indexOf("{flags.canBuildProject ? (");
    const region = detailSource.slice(
      gateAt,
      detailSource.indexOf("<SplitBuildButton"),
    );
    expect(
      region,
      "excluding draft/finalized leaves merged and cancelled buildable",
    ).not.toContain("isDraftOrFinalized");
  });
});
