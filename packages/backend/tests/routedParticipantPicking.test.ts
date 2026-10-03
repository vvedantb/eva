import { describe, expect, test } from "vitest";
import {
  candidateQuestionId,
  MAX_PICKED,
  PARTICIPANT_THRESHOLD,
  scoreOverlap,
  selectByOverlap,
  selectByProbability,
  type CandidateProfile,
} from "../convex/_routedThreads/participantPicking";

/**
 * Who a routed question reaches is decided entirely by these functions, and
 * both ways they can be wrong are quiet: too generous and a question pings
 * half the team, too strict and it reaches nobody and the agent stalls.
 */

function profile(
  name: string,
  parts: Partial<Pick<CandidateProfile, "headline" | "owns" | "askMeAbout">>,
): CandidateProfile {
  return {
    name,
    role: null,
    headline: parts.headline ?? "",
    owns: parts.owns ?? "",
    askMeAbout: parts.askMeAbout ?? "",
  };
}

describe("candidateQuestionId", () => {
  test("stays inside the id charset Jev accepts", () => {
    for (let index = 0; index < 32; index += 1) {
      expect(candidateQuestionId(index)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test("gives every candidate a distinct id", () => {
    const ids = [0, 1, 2, 10].map(candidateQuestionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("selectByProbability", () => {
  test("treats the threshold itself as included", () => {
    expect(selectByProbability([PARTICIPANT_THRESHOLD])).toEqual([0]);
    expect(selectByProbability([PARTICIPANT_THRESHOLD - 0.000_001])).toEqual([]);
  });

  test("orders the picks by confidence, not by directory position", () => {
    expect(selectByProbability([0.7, 0.95, 0.61])).toEqual([1, 0, 2]);
  });

  test("ignores a candidate Jev did not answer for", () => {
    expect(selectByProbability([null, 0.9, null])).toEqual([1]);
  });

  test("keeps directory order when confidence ties", () => {
    expect(selectByProbability([0.8, 0.8, 0.8])).toEqual([0, 1, 2]);
  });

  test("caps the group so a question does not reach everyone", () => {
    const all = selectByProbability([0.9, 0.91, 0.92, 0.93, 0.94]);
    expect(all).toHaveLength(MAX_PICKED);
    expect(all).toEqual([4, 3, 2]);
  });

  test("returns nothing when nobody clears the bar", () => {
    expect(selectByProbability([0.1, 0.2, null])).toEqual([]);
  });
});

describe("scoreOverlap", () => {
  test("counts each matching word of three or more letters", () => {
    expect(
      scoreOverlap("who owns the billing page", {
        owns: "billing",
        askMeAbout: "billing and pricing",
        headline: "",
      }),
    ).toBe(2);
  });

  test("ignores words too short to mean anything", () => {
    expect(
      scoreOverlap("is it ok to do so", {
        owns: "it ok to do so",
        askMeAbout: "",
        headline: "",
      }),
    ).toBe(0);
  });
});

describe("selectByOverlap", () => {
  test("is empty when nothing overlaps, so the caller can ask for a name", () => {
    expect(
      selectByOverlap("what should the empty state say", [
        profile("Ada", { owns: "billing" }),
        profile("Bo", { owns: "deployment" }),
      ]),
    ).toEqual([]);
  });

  test("ranks the person who owns the most of the question first", () => {
    expect(
      selectByOverlap("how should billing invoices be priced", [
        profile("Ada", { owns: "deployment" }),
        profile("Bo", { owns: "billing", askMeAbout: "invoices and pricing" }),
        profile("Cy", { owns: "invoices" }),
      ]),
    ).toEqual([1, 2]);
  });

  test("caps the fallback group the same way Jev's picks are capped", () => {
    const candidates = ["Ada", "Bo", "Cy", "Di"].map((name) =>
      profile(name, { owns: "billing" }),
    );
    expect(selectByOverlap("billing question", candidates)).toHaveLength(
      MAX_PICKED,
    );
  });
});
