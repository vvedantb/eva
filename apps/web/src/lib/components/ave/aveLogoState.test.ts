import { describe, expect, it } from "vitest";
import type { ActivityStep } from "@eva/ui";
import { aveLogoState } from "@/lib/components/ave/aveLogoState";

function step(
  type: ActivityStep["type"],
  status: ActivityStep["status"] = "active",
): ActivityStep {
  return { type, label: type, status };
}

function activity(...steps: ActivityStep[]): string {
  return JSON.stringify(steps);
}

type Input = Parameters<typeof aveLogoState>[0];

const running = {
  threadStatus: "running",
  waitingCount: 0,
  justFinished: false,
  lastRunErrored: false,
} satisfies Omit<Input, "currentActivity">;

const SEARCH_TYPES: ActivityStep["type"][] = [
  "web_search",
  "web_fetch",
  "search_code",
  "search_files",
];
const TOOL_TYPES: ActivityStep["type"][] = ["bash", "edit", "write", "read", "tool"];

describe("aveLogoState", () => {
  it("is idle when no run is going and nothing waits on the user", () => {
    expect(
      aveLogoState({ ...running, threadStatus: "idle", currentActivity: undefined }),
    ).toBe("idle");
    expect(
      aveLogoState({
        ...running,
        threadStatus: undefined,
        currentActivity: undefined,
        waitingCount: undefined,
      }),
    ).toBe("idle");
  });

  it.each([
    ["no payload yet", undefined],
    ["an empty payload", "[]"],
    ["legacy plain text", "Working..."],
    ["a thinking step", activity(step("thinking"))],
    ["a reasoning step", activity(step("reasoning"))],
    ["a finished tool and nothing after it", activity(step("bash", "complete"))],
  ])("thinks on %s", (_, currentActivity) => {
    expect(aveLogoState({ ...running, currentActivity })).toBe("thinking");
  });

  it.each(SEARCH_TYPES)(
    "searches during %s",
    (type) => {
      expect(
        aveLogoState({
          ...running,
          currentActivity: activity(step("bash", "complete"), step(type)),
        }),
      ).toBe("searching");
    },
  );

  it.each(TOOL_TYPES)(
    "uses tools during %s",
    (type) => {
      expect(
        aveLogoState({ ...running, currentActivity: activity(step(type)) }),
      ).toBe("tools");
    },
  );

  it("prefers tools over a search running alongside", () => {
    expect(
      aveLogoState({
        ...running,
        currentActivity: activity(step("web_search"), step("bash")),
      }),
    ).toBe("tools");
  });

  it("waits on an open question, over any tool in flight", () => {
    expect(
      aveLogoState({
        ...running,
        currentActivity: activity(step("bash"), step("question")),
      }),
    ).toBe("waiting");
  });

  it("does not wait on an answered question", () => {
    expect(
      aveLogoState({
        ...running,
        currentActivity: activity(step("question", "complete")),
      }),
    ).toBe("thinking");
  });

  it("waits while routed questions are pending, running or not", () => {
    expect(
      aveLogoState({
        ...running,
        threadStatus: "idle",
        currentActivity: undefined,
        waitingCount: 2,
      }),
    ).toBe("waiting");
    expect(
      aveLogoState({
        ...running,
        currentActivity: activity(step("bash")),
        waitingCount: 1,
      }),
    ).toBe("waiting");
  });

  it("plays done after a clean finish, over waiting questions", () => {
    expect(
      aveLogoState({
        ...running,
        threadStatus: "idle",
        currentActivity: undefined,
        waitingCount: 3,
        justFinished: true,
      }),
    ).toBe("done");
  });

  it("plays error after a failed finish", () => {
    expect(
      aveLogoState({
        ...running,
        threadStatus: "idle",
        currentActivity: undefined,
        justFinished: true,
        lastRunErrored: true,
      }),
    ).toBe("error");
  });

  it("ignores an old error once the one-shot has cleared", () => {
    expect(
      aveLogoState({
        ...running,
        threadStatus: "idle",
        currentActivity: undefined,
        lastRunErrored: true,
      }),
    ).toBe("idle");
  });
});
