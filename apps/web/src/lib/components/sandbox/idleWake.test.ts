import { describe, expect, test } from "vitest";
import { shouldAutoWake, type AutoWakeInput } from "./idleWake";
import { isSandboxVmTab } from "@/lib/search-params";
import { isSandboxLifecycleAlert } from "@/lib/components/chat/chatBodyUtils";
import { sandboxPausedAlertText } from "@eva/shared";

/**
 * Wake-on-tab-open is the user-facing half of idle pause. Getting it wrong in
 * either direction is costly: waking on the chat tab resumes VMs nobody asked
 * for, while not waking on the Preview tab leaves people staring at a dead
 * iframe. The predicate is pure so every gate is pinned here.
 */

function input(overrides: Partial<AutoWakeInput> = {}): AutoWakeInput {
  return {
    mode: "on",
    status: "closed",
    hasSandbox: true,
    sandboxError: undefined,
    tabOpen: true,
    readOnly: false,
    busy: false,
    ...overrides,
  };
}

describe("shouldAutoWake", () => {
  test("wakes a paused sandbox when a VM tab is open and the setting is on", () => {
    expect(shouldAutoWake(input())).toBe(true);
  });

  test("the setting off or in dry-run keeps today's explicit button", () => {
    expect(shouldAutoWake(input({ mode: "off" }))).toBe(false);
    expect(shouldAutoWake(input({ mode: "dry-run" }))).toBe(false);
    expect(shouldAutoWake(input({ mode: undefined }))).toBe(false);
  });

  test("only a closed sandbox is woken", () => {
    for (const status of ["active", "starting", "stopping", undefined]) {
      expect(shouldAutoWake(input({ status }))).toBe(false);
    }
  });

  test("chat-only views never wake", () => {
    expect(shouldAutoWake(input({ tabOpen: false }))).toBe(false);
  });

  test("a failed last start, a read-only surface, or a busy run block the wake", () => {
    expect(shouldAutoWake(input({ sandboxError: "boom" }))).toBe(false);
    expect(shouldAutoWake(input({ readOnly: true }))).toBe(false);
    expect(shouldAutoWake(input({ busy: true }))).toBe(false);
    expect(shouldAutoWake(input({ hasSandbox: false }))).toBe(false);
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
