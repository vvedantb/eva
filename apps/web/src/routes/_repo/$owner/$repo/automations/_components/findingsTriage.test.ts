import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import {
  defaultSelectedIds,
  DUPLICATE_HINT_THRESHOLD,
  effectiveSeverity,
  isLikelyDuplicate,
  isSelected,
  overridesForClear,
  overridesForSelectAll,
  SEVERITY_RANK,
  sortFindings,
  toggleOverride,
  type Finding,
  type FindingSeverity,
} from "./findingsTriage";

const taskId = z.custom<Id<"agentTasks">>();

function finding(
  id: string,
  severity: FindingSeverity,
  extra: Partial<Finding> = {},
): Finding {
  return {
    id,
    title: `Finding ${id}`,
    description: "",
    severity,
    ...extra,
  };
}

function triaged(
  id: string,
  agentSeverity: FindingSeverity,
  triageSeverity: FindingSeverity,
  duplicateProbability = 0,
): Finding {
  const duplicate =
    duplicateProbability > 0
      ? { duplicateOfTaskId: taskId.parse(`task_${id}`), duplicateOfNumId: 7 }
      : {};
  return finding(id, agentSeverity, {
    triage: {
      severity: triageSeverity,
      duplicateProbability,
      evaluatedAt: 0,
      ...duplicate,
    },
  });
}

describe("effectiveSeverity", () => {
  it("falls back to the agent's severity when untriaged", () => {
    expect(effectiveSeverity(finding("a", "medium"))).toBe("medium");
  });

  it("prefers Jev's severity once triaged", () => {
    expect(effectiveSeverity(triaged("a", "medium", "critical"))).toBe(
      "critical",
    );
  });
});

describe("sortFindings", () => {
  it("puts the worst first by effective severity", () => {
    const sorted = sortFindings([
      finding("low", "low"),
      triaged("promoted", "low", "critical"),
      finding("high", "high"),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["promoted", "high", "low"]);
  });

  it("keeps agent order within one severity and leaves the input alone", () => {
    const input = [
      finding("first", "high"),
      finding("second", "high"),
      finding("third", "high"),
    ];
    expect(sortFindings(input).map((f) => f.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(input.map((f) => f.id)).toEqual(["first", "second", "third"]);
  });

  it("ranks every severity", () => {
    expect(SEVERITY_RANK.critical).toBeGreaterThan(SEVERITY_RANK.high);
    expect(SEVERITY_RANK.high).toBeGreaterThan(SEVERITY_RANK.medium);
    expect(SEVERITY_RANK.medium).toBeGreaterThan(SEVERITY_RANK.low);
  });
});

describe("isLikelyDuplicate", () => {
  it("is false without triage", () => {
    expect(isLikelyDuplicate(finding("a", "high"))).toBe(false);
  });

  it("is false when Jev found no duplicate", () => {
    expect(isLikelyDuplicate(triaged("a", "high", "high", 0))).toBe(false);
  });

  it("is false below the threshold", () => {
    expect(
      isLikelyDuplicate(
        triaged("a", "high", "high", DUPLICATE_HINT_THRESHOLD - 0.01),
      ),
    ).toBe(false);
  });

  it("is true at or above the threshold", () => {
    expect(
      isLikelyDuplicate(triaged("a", "high", "high", DUPLICATE_HINT_THRESHOLD)),
    ).toBe(true);
  });
});

describe("defaultSelectedIds", () => {
  it("ticks severe findings only", () => {
    const defaults = defaultSelectedIds([
      finding("low", "low"),
      finding("medium", "medium"),
      finding("high", "high"),
      finding("critical", "critical"),
    ]);
    expect([...defaults].toSorted()).toEqual(["critical", "high"]);
  });

  it("uses the triaged severity, both directions", () => {
    const defaults = defaultSelectedIds([
      triaged("promoted", "low", "critical"),
      triaged("demoted", "critical", "low"),
    ]);
    expect([...defaults]).toEqual(["promoted"]);
  });

  it("skips findings already converted to a task", () => {
    const linked = finding("linked", "critical", {
      taskId: taskId.parse("task_linked"),
    });
    expect(defaultSelectedIds([linked]).size).toBe(0);
  });

  it("skips likely duplicates of open work", () => {
    const duplicate = triaged("dupe", "high", "high", 0.95);
    expect(defaultSelectedIds([duplicate]).size).toBe(0);
  });
});

describe("selection algebra", () => {
  const defaults = new Set(["a"]);

  it("selects the defaults when nothing is overridden", () => {
    expect(isSelected("a", defaults, new Set())).toBe(true);
    expect(isSelected("b", defaults, new Set())).toBe(false);
  });

  it("flips a default off and a non-default on", () => {
    expect(isSelected("a", defaults, new Set(["a"]))).toBe(false);
    expect(isSelected("b", defaults, new Set(["b"]))).toBe(true);
  });

  it("toggles one id without mutating the previous set", () => {
    const overrides = new Set(["a"]);
    expect([...toggleOverride(overrides, "b")].toSorted()).toEqual(["a", "b"]);
    expect([...toggleOverride(overrides, "a")]).toEqual([]);
    expect([...overrides]).toEqual(["a"]);
  });

  it("selects all by overriding everything not already default", () => {
    const overrides = overridesForSelectAll(["a", "b", "c"], defaults);
    expect([...overrides].toSorted()).toEqual(["b", "c"]);
    for (const id of ["a", "b", "c"]) {
      expect(isSelected(id, defaults, overrides)).toBe(true);
    }
  });

  it("clears by overriding exactly the defaults", () => {
    const overrides = overridesForClear(["a", "b", "c"], defaults);
    expect([...overrides]).toEqual(["a"]);
    for (const id of ["a", "b", "c"]) {
      expect(isSelected(id, defaults, overrides)).toBe(false);
    }
  });
});
