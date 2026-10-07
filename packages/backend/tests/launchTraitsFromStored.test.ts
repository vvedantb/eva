import { describe, expect, test } from "vitest";
import {
  buildTraitsExecutionPayload,
  launchTraitsFromStored,
} from "../convex/_validators/aiModels";

/**
 * Page-open prewarms forward a surface's sticky `last*` traits into the daemon
 * launch. The send path instead normalises through
 * `buildTraitsExecutionPayload`, which OMITS every model default. Forwarding
 * the stored values verbatim therefore produced a different daemon opts
 * signature (e.g. `…|high|…|0|…` vs `…||…||…`) and killed + respawned the warm
 * daemon on every page open. `launchTraitsFromStored` is the single helper both
 * paths must agree on.
 */
describe("launchTraitsFromStored", () => {
  test("drops every model default for a Claude model", () => {
    const stored = {
      reasoningLevel: "high",
      thinkingEnabled: true,
      use1mContext: false,
      fastMode: false,
    } as const;

    // Fable's reasoning default is "high"; it has no thinkingToggle and no
    // fastMode trait, and 1M context is opt-in.
    expect(launchTraitsFromStored("claude:claude-fable-5-1", stored)).toEqual(
      {},
    );

    // Session 166's exact payload: the composer overrides reasoningLevel with
    // the display value, so the server receives the default "high" explicitly.
    // Sending the defaults must launch identically to omitting them — otherwise
    // the turn prewarm's opts sig has `|high|` where the page-open prewarm has
    // `||`, and the second prewarm kills the daemon the first just booted.
    expect(launchTraitsFromStored("claude:claude-fable-5-1", stored)).toEqual(
      launchTraitsFromStored("claude:claude-fable-5-1", {}),
    );
  });

  test("matches the composer payload for the same traits", () => {
    const model = "claude:claude-fable-5-1";
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
    // Grok 4.6's reasoning default is "high". Fast is always sent explicitly so
    // a bare Cursor model id cannot resolve to the pricier Fast variant.
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
      launchTraitsFromStored("claude:claude-fable-5-1", {
        reasoningLevel: "low",
      }),
    ).toEqual({ reasoningLevel: "low" });

    // Haiku is the Claude model carrying the thinking toggle.
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
