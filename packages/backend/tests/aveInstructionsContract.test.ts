import { describe, expect, test } from "vitest";
import { buildAveInstructions } from "../convex/_ave/prompt";

const instructions = buildAveInstructions({
  now: new Date("2026-09-26T00:00:00Z"),
  role: undefined,
  customInstructions: undefined,
});

describe("Manager Ave instructions", () => {
  test("carry no shell, logs or sandbox guidance", () => {
    for (const banned of ["npx ", "gh ", "vercel logs", "/tmp/repo", "Bash", "home repo"]) {
      expect(instructions).not.toContain(banned);
    }
  });

  test("never offer excluded tools", () => {
    for (const excluded of [
      "send_chat_message",
      "start_sandbox",
      "render_ui",
      "send_email",
      "create_automation",
      "schedule_task",
      "start_project_build",
    ]) {
      expect(instructions).not.toContain(`\`${excluded}\``);
    }
  });

  test("keep the user's custom instructions", () => {
    expect(
      buildAveInstructions({
        now: new Date(),
        role: undefined,
        customInstructions: "Always answer in French.",
      }),
    ).toContain("Always answer in French.");
  });
});
