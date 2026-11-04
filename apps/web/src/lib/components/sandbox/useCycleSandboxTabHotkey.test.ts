import { describe, expect, test } from "vitest";
import { stepSandboxTab } from "./useCycleSandboxTabHotkey";

const tabs = ["preview", "browser", "review"];

describe("stepSandboxTab", () => {
  test("steps forward and wraps past the last tab", () => {
    expect(stepSandboxTab(tabs, "preview", 1)).toBe("browser");
    expect(stepSandboxTab(tabs, "review", 1)).toBe("preview");
  });

  test("steps backward and wraps past the first tab", () => {
    expect(stepSandboxTab(tabs, "review", -1)).toBe("browser");
    expect(stepSandboxTab(tabs, "preview", -1)).toBe("review");
  });

  test("treats an unknown active tab as the first one", () => {
    expect(stepSandboxTab(tabs, "gone", 1)).toBe("browser");
    expect(stepSandboxTab(tabs, "gone", -1)).toBe("review");
  });

  test("returns nothing when there are no tabs", () => {
    expect(stepSandboxTab([], "preview", -1)).toBeUndefined();
  });
});
