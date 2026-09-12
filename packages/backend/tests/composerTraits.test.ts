import { describe, expect, test } from "vitest";
import {
  composerTraitFields,
  hasComposerTraitUpdate,
} from "../convex/_shared/composerTraits";

describe("composerTraitFields", () => {
  test("omits every last-* field when no knobs are set", () => {
    expect(composerTraitFields({})).toEqual({});
  });

  test("maps only the knobs that were provided", () => {
    expect(
      composerTraitFields({
        reasoningLevel: "high",
        fastMode: true,
      }),
    ).toEqual({
      lastReasoningLevel: "high",
      lastFastMode: true,
    });
  });

  test("maps every knob when all are present", () => {
    expect(
      composerTraitFields({
        reasoningLevel: "low",
        thinkingEnabled: false,
        use1mContext: true,
        fastMode: false,
      }),
    ).toEqual({
      lastReasoningLevel: "low",
      lastThinkingEnabled: false,
      lastUse1mContext: true,
      lastFastMode: false,
    });
  });
});

describe("hasComposerTraitUpdate", () => {
  test("is false when every knob is absent", () => {
    expect(hasComposerTraitUpdate({})).toBe(false);
  });

  test("is true for a single provided knob, including false", () => {
    expect(hasComposerTraitUpdate({ fastMode: false })).toBe(true);
  });
});
