import { describe, expect, it } from "vitest";
import type { SlashItem } from "@/lib/components/mentions";
import {
  pickSkillSuggestions,
  shouldSuggestFor,
  SUGGEST_MAX_CHIPS,
  SUGGEST_MIN_NEEDS_SKILL,
  SUGGEST_MIN_PROBABILITY,
} from "@/lib/components/chat/_components/skillSuggestionsPick";

const skillItems: SlashItem[] = [
  { id: "system:review", label: "review", description: "Review the diff" },
  { id: "repo:ship", label: "ship", description: "Commit and push" },
  { id: "harness:plan", label: "plan", description: "Write a plan" },
  { id: "repo:changelog", label: "changelog", description: "Add an entry" },
];

const none = new Set<string>();

describe("shouldSuggestFor", () => {
  it("waits for a request worth ranking", () => {
    expect(shouldSuggestFor("hi")).toBe(false);
    expect(shouldSuggestFor("   ")).toBe(false);
    expect(shouldSuggestFor("please review the composer diff")).toBe(true);
  });

  it("stays out of the way while a picker trigger is being typed", () => {
    expect(shouldSuggestFor("please review the diff /rev")).toBe(false);
    expect(shouldSuggestFor("please review the diff @ved")).toBe(false);
    expect(shouldSuggestFor("please /review the whole diff now")).toBe(true);
  });
});

describe("pickSkillSuggestions", () => {
  const ctx = {
    text: "please review the composer diff",
    skillItems,
    dismissed: none,
  };

  it("returns nothing without a response", () => {
    expect(pickSkillSuggestions(null, ctx)).toEqual([]);
  });

  it("returns nothing when no skill is needed", () => {
    const picked = pickSkillSuggestions(
      {
        needsSkill: SUGGEST_MIN_NEEDS_SKILL - 0.01,
        suggestions: [{ id: "system:review", probability: 0.9 }],
      },
      ctx,
    );
    expect(picked).toEqual([]);
  });

  it("keeps confident suggestions in Jev's order", () => {
    const picked = pickSkillSuggestions(
      {
        needsSkill: 0.8,
        suggestions: [
          { id: "repo:ship", probability: 0.6 },
          { id: "system:review", probability: 0.3 },
        ],
      },
      ctx,
    );
    expect(picked.map((item) => item.id)).toEqual([
      "repo:ship",
      "system:review",
    ]);
  });

  it("drops low-probability, unknown and dismissed suggestions", () => {
    const picked = pickSkillSuggestions(
      {
        needsSkill: 0.9,
        suggestions: [
          { id: "repo:ship", probability: SUGGEST_MIN_PROBABILITY - 0.01 },
          { id: "gone:skill", probability: 0.9 },
          { id: "harness:plan", probability: 0.8 },
          { id: "system:review", probability: 0.7 },
        ],
      },
      { ...ctx, dismissed: new Set(["harness:plan"]) },
    );
    expect(picked.map((item) => item.id)).toEqual(["system:review"]);
  });

  it("drops a skill already written into the draft", () => {
    const picked = pickSkillSuggestions(
      {
        needsSkill: 0.9,
        suggestions: [
          { id: "system:review", probability: 0.9 },
          { id: "repo:ship", probability: 0.8 },
        ],
      },
      { ...ctx, text: "/Review the composer diff then land it" },
    );
    expect(picked.map((item) => item.id)).toEqual(["repo:ship"]);
  });

  it("caps the chip count", () => {
    const picked = pickSkillSuggestions(
      {
        needsSkill: 0.9,
        suggestions: skillItems.map((item) => ({
          id: item.id,
          probability: 0.9,
        })),
      },
      { ...ctx, text: "do the whole release routine for me" },
    );
    expect(picked).toHaveLength(SUGGEST_MAX_CHIPS);
  });
});
