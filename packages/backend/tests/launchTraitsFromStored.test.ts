import { describe, expect, test } from "bun:test";
import {
  buildTraitsExecutionPayload,
  launchTraitsFromStored,
} from "../convex/_validators/aiModels";

describe("launchTraitsFromStored", () => {
  test("drops every model default for a Claude model", () => {
    const stored = {
      reasoningLevel: "high",
      thinkingEnabled: true,
      use1mContext: false,
      fastMode: false,
    } as const;

    expect(launchTraitsFromStored("claude:claude-fable-5-2", stored)).toEqual(
      {},
    );

    expect(launchTraitsFromStored("claude:claude-fable-5-2", stored)).toEqual(
      launchTraitsFromStored("claude:claude-fable-5-2", {}),
    );
  });

  test("matches the composer payload for the same traits", () => {
    const model = "claude:claude-fable-5-2";
    const stored = {
      reasoningLevel: "high",
      thinkingEnabled: true,
      use1mContext: false,
      fastMode: false,
    } as const;

    expect(launchTraitsFromStored(model, stored)).toEqual(
      buildTraitsExecutionPayload(model, {
        effortLevel: stored.reasoningLevel,
        thinkingEnabled: stored.thinkingEnabled,
        use1mContext: stored.use1mContext,
        fastMode: stored.fastMode,
      }),
    );
  });

  test("keeps Fast explicit on Cursor models while dropping default reasoning", () => {
    expect(
      launchTraitsFromStored("cursor:grok-4.6", {
        reasoningLevel: "high",
        fastMode: false,
      }),
    ).toEqual({ fastMode: false });

    expect(
      launchTraitsFromStored("cursor:grok-4.6", {
        reasoningLevel: "xhigh",
        fastMode: true,
      }),
    ).toEqual({ reasoningLevel: "xhigh", fastMode: true });
  });

  test("preserves non-default reasoning and a disabled thinking toggle", () => {
    expect(
      launchTraitsFromStored("claude:claude-fable-5-2", {
        reasoningLevel: "low",
      }),
    ).toEqual({ reasoningLevel: "low" });

    expect(
      launchTraitsFromStored("claude:haiku", { thinkingEnabled: false }),
    ).toEqual({ thinkingEnabled: false });
    expect(
      launchTraitsFromStored("claude:haiku", { thinkingEnabled: true }),
    ).toEqual({});
  });

  test("passes 1M context through only when opted in", () => {
    expect(
      launchTraitsFromStored("claude:sonnet", {
        reasoningLevel: "high",
        use1mContext: true,
      }),
    ).toEqual({ use1mContext: true });
  });

  test("undefined stored traits produce an empty payload", () => {
    expect(launchTraitsFromStored("claude:sonnet", {})).toEqual({});
    expect(launchTraitsFromStored(undefined, {})).toEqual({});
  });
});
