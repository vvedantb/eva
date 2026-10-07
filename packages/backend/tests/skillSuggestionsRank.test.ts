import { describe, expect, it } from "vitest";
import {
  dedupeCandidates,
  rankSuggestions,
  MAX_CANDIDATES,
  MAX_SUGGESTIONS,
  NONE_OPTION,
} from "../convex/_skillSuggestions/rank";

describe("dedupeCandidates", () => {
  it("keeps the first entry for a label and trims it", () => {
    const out = dedupeCandidates([
      { id: "system:review", label: "  review  ", description: "eva review" },
      { id: "repo:review", label: "review", description: "repo review" },
      { id: "repo:ship", label: "ship", description: "ship it" },
    ]);
    expect(out).toEqual([
      { id: "system:review", label: "review", description: "eva review" },
      { id: "repo:ship", label: "ship", description: "ship it" },
    ]);
  });

  it("drops empty labels and the reserved escape-hatch name", () => {
    const out = dedupeCandidates([
      { id: "a", label: "   ", description: "blank" },
      { id: "b", label: NONE_OPTION, description: "reserved" },
      { id: "c", label: "None", description: "also reserved" },
      { id: "d", label: "plan", description: "plan it" },
    ]);
    expect(out.map((item) => item.id)).toEqual(["d"]);
  });

  it("caps the option list", () => {
    const many = Array.from({ length: MAX_CANDIDATES + 20 }, (_, index) => ({
      id: `skill-${index}`,
      label: `skill-${index}`,
      description: "",
    }));
    expect(dedupeCandidates(many)).toHaveLength(MAX_CANDIDATES);
  });
});

describe("rankSuggestions", () => {
  const candidates = [
    { id: "system:review", label: "review" },
    { id: "repo:ship", label: "ship" },
    { id: "harness:plan", label: "plan" },
  ];

  it("maps labels back to ids, best first", () => {
    const ranked = rankSuggestions(
      { review: 0.2, ship: 0.7, plan: 0.05 },
      candidates,
    );
    expect(ranked).toEqual([
      { id: "repo:ship", probability: 0.7 },
      { id: "system:review", probability: 0.2 },
      { id: "harness:plan", probability: 0.05 },
    ]);
  });

  it("ignores the escape hatch and labels it did not offer", () => {
    const ranked = rankSuggestions(
      { [NONE_OPTION]: 0.9, invented: 0.8, review: 0.1 },
      candidates,
    );
    expect(ranked).toEqual([{ id: "system:review", probability: 0.1 }]);
  });

  it("returns nothing when Jev reported no probabilities", () => {
    expect(rankSuggestions({}, candidates)).toEqual([]);
  });

  it("caps the ranked list", () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 5 }, (_, index) => ({
      id: `id-${index}`,
      label: `label-${index}`,
    }));
    const probabilities = Object.fromEntries(
      many.map((item, index) => [item.label, index / 100]),
    );
    const ranked = rankSuggestions(probabilities, many);
    expect(ranked).toHaveLength(MAX_SUGGESTIONS);
    expect(ranked[0]?.id).toBe(`id-${many.length - 1}`);
  });
});
