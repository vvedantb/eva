import { describe, expect, it } from "vitest";
import {
  decideSandboxStartPlan,
  resolveAgentDelivery,
} from "../convex/mcp/orchestratorDelivery";
import { DEFAULT_AI_MODEL } from "../convex/_validators/aiModels";

describe("resolveAgentDelivery", () => {
  it("queues for a busy agent and starts a turn for an idle one", () => {
    expect(resolveAgentDelivery({ isBusy: true }).action).toBe("queue");
    expect(resolveAgentDelivery({ isBusy: false }).action).toBe("start");
  });

  it("prefers the requested model over the agent's stored one", () => {
    expect(
      resolveAgentDelivery({
        isBusy: false,
        requestedModel: "opus",
        storedModel: "haiku",
      }).model,
    ).toBe("claude:opus");
  });

  it("falls back to the stored model when none is requested", () => {
    expect(
      resolveAgentDelivery({ isBusy: true, storedModel: "haiku" }).model,
    ).toBe("claude:haiku");
  });

  it("falls back to the platform default when neither is set", () => {
    expect(resolveAgentDelivery({ isBusy: false }).model).toBe(
      DEFAULT_AI_MODEL,
    );
  });

  it("normalises an unrecognised model rather than passing it through", () => {
    expect(
      resolveAgentDelivery({ isBusy: false, requestedModel: "not-a-model" })
        .model,
    ).toBe(DEFAULT_AI_MODEL);
  });
});

describe("decideSandboxStartPlan", () => {
  it("runs when the preview sandbox is already active", () => {
    expect(decideSandboxStartPlan("active")).toBe("run");
  });

  it("waits out a start or stop already in flight", () => {
    expect(decideSandboxStartPlan("starting")).toBe("wait");
    expect(decideSandboxStartPlan("stopping")).toBe("wait");
  });

  it("starts when the sandbox is closed, missing, or unknown", () => {
    expect(decideSandboxStartPlan("closed")).toBe("start");
    expect(decideSandboxStartPlan(undefined)).toBe("start");
    expect(decideSandboxStartPlan("error")).toBe("start");
  });
});
