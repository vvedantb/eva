import { describe, expect, it } from "bun:test";
import {
  decideSandboxStartPlan,
  resolveAgentModel,
} from "../convex/mcp/orchestratorDelivery";
import { DEFAULT_AI_MODEL } from "../convex/_validators/aiModels";

describe("resolveAgentModel", () => {
  it("prefers the requested model over the agent's stored one", () => {
    expect(resolveAgentModel("opus", "haiku")).toBe("claude:opus");
  });

  it("falls back to the stored model when none is requested", () => {
    expect(resolveAgentModel(undefined, "haiku")).toBe("claude:haiku");
  });

  it("falls back to the platform default when neither is set", () => {
    expect(resolveAgentModel(undefined, undefined)).toBe(DEFAULT_AI_MODEL);
  });

  it("normalises an unrecognised model rather than passing it through", () => {
    expect(resolveAgentModel("not-a-model", undefined)).toBe(DEFAULT_AI_MODEL);
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
