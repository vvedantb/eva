import { beforeEach, describe, expect, test } from "vitest";
import {
  AUTO_WAKE_COOLDOWN_MS,
  resetAutoWakeHistory,
  shouldFireAutoWake,
} from "./idleWake";
import { isSandboxVmTab } from "@/lib/search-params";
import { isSandboxLifecycleAlert } from "@/lib/components/chat/chatBodyUtils";
import { sandboxPausedAlertText } from "@eva/shared";

/**
 * Auto-wake fires when a visible sandbox tab of a paused sandbox mounts. A
 * failed start lands back on `closed` and remounts it, so the cooldown is what
 * stops a start that keeps failing from looping.
 */
describe("shouldFireAutoWake", () => {
  beforeEach(() => {
    resetAutoWakeHistory();
  });

  test("the first wake for an entity fires", () => {
    expect(shouldFireAutoWake("a", 0)).toBe(true);
  });

  test("a second wake inside the cooldown is refused", () => {
    expect(shouldFireAutoWake("a", 0)).toBe(true);
    expect(shouldFireAutoWake("a", AUTO_WAKE_COOLDOWN_MS - 1)).toBe(false);
  });

  test("a wake after the cooldown fires again", () => {
    expect(shouldFireAutoWake("a", 0)).toBe(true);
    expect(shouldFireAutoWake("a", AUTO_WAKE_COOLDOWN_MS)).toBe(true);
  });

  test("entities have independent cooldowns", () => {
    expect(shouldFireAutoWake("a", 0)).toBe(true);
    expect(shouldFireAutoWake("b", 1)).toBe(true);
  });
});

describe("isSandboxVmTab", () => {
  test("VM tabs and custom-tab slugs count", () => {
    for (const tab of ["preview", "browser", "editor", "computer", "files"]) {
      expect(isSandboxVmTab(tab)).toBe(true);
    }
    expect(isSandboxVmTab("supabase-studio")).toBe(true);
    expect(isSandboxVmTab("files?file=/tmp/repo/a.ts")).toBe(true);
  });

  test("tabs that read Convex, not the VM, do not", () => {
    for (const tab of [
      "review",
      "agents",
      "prd",
      "designs",
      "artifacts",
      "documents",
      "",
    ]) {
      expect(isSandboxVmTab(tab)).toBe(false);
    }
  });
});

describe("isSandboxLifecycleAlert", () => {
  test("the idle divider is a lifecycle alert like the plain stop", () => {
    expect(
      isSandboxLifecycleAlert({
        isSystemAlert: true,
        content: sandboxPausedAlertText(25),
      }),
    ).toBe(true);
    expect(
      isSandboxLifecycleAlert({ isSystemAlert: true, content: "Sandbox stopped" }),
    ).toBe(true);
    expect(
      isSandboxLifecycleAlert({ isSystemAlert: false, content: "Sandbox stopped" }),
    ).toBe(false);
  });
});
