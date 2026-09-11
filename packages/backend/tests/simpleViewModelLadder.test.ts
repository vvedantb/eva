import { describe, expect, it } from "vitest";
import {
  SIMPLE_VIEW_MODEL_LADDER,
  snapToSimpleViewLadder,
} from "../convex/_validators/aiModels";

describe("SIMPLE_VIEW_MODEL_LADDER", () => {
  it("is composer → grok 4.5 → grok 4.6 → opus → fable", () => {
    expect(SIMPLE_VIEW_MODEL_LADDER).toEqual([
      "cursor:composer-2.5",
      "cursor:grok-4.5",
      "cursor:grok-4.6",
      "claude:opus",
      "claude:claude-fable-5-1",
    ]);
  });
});

describe("snapToSimpleViewLadder", () => {
  it("keeps an exact ladder model", () => {
    expect(snapToSimpleViewLadder("cursor:grok-4.6")).toBe("cursor:grok-4.6");
    expect(snapToSimpleViewLadder("claude:opus")).toBe("claude:opus");
  });

  it("snaps Claude family onto opus, fable onto fable", () => {
    expect(snapToSimpleViewLadder("claude:sonnet")).toBe("claude:opus");
    expect(snapToSimpleViewLadder("claude:haiku")).toBe("claude:opus");
    expect(snapToSimpleViewLadder("claude:claude-opus-4-6")).toBe("claude:opus");
    expect(snapToSimpleViewLadder("claude:claude-fable-5")).toBe(
      "claude:claude-fable-5-1",
    );
    expect(snapToSimpleViewLadder("claude:claude-fable-5-1")).toBe(
      "claude:claude-fable-5-1",
    );
  });

  it("snaps Cursor composer and grok 4.5 variants onto their ticks", () => {
    expect(snapToSimpleViewLadder("cursor:composer-2")).toBe(
      "cursor:composer-2.5",
    );
    expect(snapToSimpleViewLadder("cursor:grok-4.5-high")).toBe(
      "cursor:grok-4.5",
    );
    expect(snapToSimpleViewLadder("cursor:gpt-6-astra")).toBe(
      "cursor:grok-4.6",
    );
  });
});
