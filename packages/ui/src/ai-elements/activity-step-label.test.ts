import { describe, expect, it } from "vitest";
import {
  deriveActionGroupSummary,
  deriveReadableCommandDisplay,
  deriveStepRowPresentation,
  resolveCommandVisualKind,
} from "./activity-step-label";
import type { ActivityStep } from "./activity-shared";

function step(
  overrides: Partial<ActivityStep> & Pick<ActivityStep, "type" | "label">,
): ActivityStep {
  return {
    status: "complete",
    ...overrides,
  };
}

describe("deriveReadableCommandDisplay", () => {
  it("extracts search targets without leaking the full shell wrapper inline", () => {
    expect(
      deriveReadableCommandDisplay(
        `/bin/zsh -lc 'rg -n "tool call" apps/web/src'`,
      ),
    ).toEqual({
      verb: "Searched",
      target: "for tool call in web/src",
    });
  });

  it("compacts file paths for read commands", () => {
    expect(
      deriveReadableCommandDisplay(
        "sed -n '520,550p' apps/web/src/components/chat/MessagesTimeline.tsx",
      ),
    ).toEqual({
      verb: "Read",
      target: "chat/MessagesTimeline.tsx",
    });
  });

  it("unwraps zsh shell wrappers around read commands", () => {
    expect(
      deriveReadableCommandDisplay(
        `/bin/zsh -lc "sed -n '240,520p' src/components/provider-card.tsx"`,
      ),
    ).toEqual({
      verb: "Read",
      target: "components/provider-card.tsx",
    });
  });

  it("keeps quoted paths intact when shell wrappers include cd chaining", () => {
    expect(
      deriveReadableCommandDisplay(
        `zsh -lc "cd '/tmp/my app' && sed -n '1,260p' src/pages/overview.tsx"`,
      ),
    ).toEqual({
      verb: "Read",
      target: "pages/overview.tsx",
    });
  });

  it("does not discard real chained commands after a shell wrapper", () => {
    expect(
      deriveReadableCommandDisplay(
        `/bin/zsh -lc 'rm -f /tmp/test.log && bun run --cwd apps/server test'`,
      ),
    ).toEqual({
      verb: "Removed",
      target: "/tmp/test.log",
    });
  });

  it("removes env and timeout wrappers from inline command summaries", () => {
    expect(
      deriveReadableCommandDisplay(
        "env -u SYNARA_AUTH_TOKEN SYNARA_PORT_OFFSET=3158 timeout 180s bun run dev",
        true,
      ),
    ).toEqual({
      verb: "Running",
      target: "bun run dev",
    });
  });

  it("summarizes inline script commands without leaking the script body", () => {
    expect(
      deriveReadableCommandDisplay(
        `node -e "const fs = require('fs'); console.log(fs.cwd)"`,
        true,
      ),
    ).toEqual({
      verb: "Running",
      target: "node script",
    });

    expect(
      deriveReadableCommandDisplay("python3 - <<'PY'\nprint('hi')\nPY", true),
    ).toEqual({
      verb: "Running",
      target: "python script",
    });
  });

  it("humanizes current-directory searches without leaking placeholder dots", () => {
    expect(deriveReadableCommandDisplay(`rg -n "model(s)?" .`)).toEqual({
      verb: "Searched",
      target: "for model(s)? in current directory",
    });
  });

  it("falls back to a directory summary when the search token is only punctuation", () => {
    expect(deriveReadableCommandDisplay(`rg -n . src/lib`)).toEqual({
      verb: "Searched",
      target: "in src/lib",
    });
  });

  it("humanizes git status commands", () => {
    expect(deriveReadableCommandDisplay("git status --short")).toEqual({
      verb: "Checked",
      target: "git status",
    });
  });
});

describe("resolveCommandVisualKind", () => {
  it("classifies git commands through shell and global-option wrappers", () => {
    expect(resolveCommandVisualKind("git status --short")).toBe("git");
    expect(resolveCommandVisualKind("git -C apps/web status --short")).toBe(
      "git",
    );
    expect(
      resolveCommandVisualKind(`/bin/zsh -lc "cd repo && git branch -vv"`),
    ).toBe("git");
  });

  it("maps GitHub CLI commands to terminal", () => {
    expect(resolveCommandVisualKind("gh pr view 274 --repo owner/repo")).toBe(
      "terminal",
    );
    expect(resolveCommandVisualKind("env -u GH_TOKEN gh pr status")).toBe(
      "terminal",
    );
    expect(resolveCommandVisualKind("hub pull-request -m test")).toBe(
      "terminal",
    );
  });

  it("keeps inspections and ordinary commands distinct", () => {
    expect(resolveCommandVisualKind(`rg -n "tool call" apps/web/src`)).toBe(
      "inspect",
    );
    expect(resolveCommandVisualKind("bun run build")).toBe("terminal");
  });
});

describe("deriveStepRowPresentation", () => {
  it("maps file steps to verb + file chip basename", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "read",
          label: "Reading file...",
          detail: "src/components/App.tsx",
          path: "/repo/src/components/App.tsx",
        }),
        false,
      ),
    ).toEqual({
      text: "Read",
      fileChip: { name: "App.tsx", path: "/repo/src/components/App.tsx" },
    });
  });

  it("humanizes bash commands into a readable verb + target", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "bash",
          label: "Running command...",
          detail: `rg -n "tool call" apps/web/src`,
        }),
        false,
      ),
    ).toEqual({
      text: "Searched for tool call in web/src",
    });
  });

  it("keeps background shell labels with compact command text", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "bash",
          label: "Running in background...",
          detail: "pnpm dev --filter @eva/web",
        }),
        true,
      ),
    ).toEqual({
      text: "Running in background pnpm dev --filter @eva/web",
    });
  });

  it("falls back to step label when bash has no detail", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "bash",
          label: "Running command...",
        }),
        true,
      ),
    ).toEqual({ text: "Running command..." });
  });

  it("formats search_code and search_files patterns", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "search_code",
          label: "Searching code...",
          detail: "deriveStepRowPresentation",
        }),
        false,
      ),
    ).toEqual({ text: 'Searched for "deriveStepRowPresentation"' });

    expect(
      deriveStepRowPresentation(
        step({
          type: "search_files",
          label: "Searching files...",
          detail: "**/*.tsx",
        }),
        true,
      ),
    ).toEqual({ text: 'Finding files matching "**/*.tsx"' });
  });

  it("formats web fetch and search rows", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "web_fetch",
          label: "Fetching URL...",
          detail: "https://ui.shadcn.com/docs/components",
        }),
        false,
      ),
    ).toEqual({
      text: "Fetched ui.shadcn.com",
      title: "https://ui.shadcn.com/docs/components",
    });

    expect(
      deriveStepRowPresentation(
        step({
          type: "web_search",
          label: "Searching web...",
          detail: "react 19 use hook",
        }),
        true,
      ),
    ).toEqual({ text: 'Searching the web for "react 19 use hook"' });
  });

  it("formats subtask and todos rows", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "subtask",
          label: "Running agent...",
          detail: "Explore auth module",
        }),
        false,
      ),
    ).toEqual({ text: "Ran agent: Explore auth module" });

    expect(
      deriveStepRowPresentation(
        step({
          type: "todos",
          label: "Updating tasks...",
        }),
        true,
      ),
    ).toEqual({ text: "Updating tasks" });
  });

  it("humanizes MCP tool rows and file change tools", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "tool",
          label: "Using mcp__codex_apps__github_fetch_pr...",
        }),
        false,
      ),
    ).toEqual({ text: "Used Codex Apps: Github Fetch Pr" });

    expect(
      deriveStepRowPresentation(
        step({
          type: "tool",
          label: "File change",
          detail: "file_change",
        }),
        false,
      ),
    ).toEqual({ text: "Edited files" });
  });

  it("names the wait while a question is open, and the question once answered", () => {
    expect(
      deriveStepRowPresentation(
        step({
          type: "question",
          label: "Asking a question...",
        }),
        true,
      ),
    ).toEqual({ text: "Waiting for your answer" });

    expect(
      deriveStepRowPresentation(
        step({
          type: "question",
          label: "Asked a question",
          detail: "Which surface should own this?",
        }),
        false,
      ),
    ).toEqual({ text: "Asked: Which surface should own this?" });
  });

  it("falls back to the step label for a question with no detail", () => {
    expect(
      deriveStepRowPresentation(
        step({ type: "question", label: "Asked a question" }),
        false,
      ),
    ).toEqual({ text: "Asked a question" });
  });
});

describe("deriveActionGroupSummary", () => {
  it("lists each distinct kind of work once, in order", () => {
    expect(
      deriveActionGroupSummary([
        step({ type: "tool", label: "Used tool" }),
        step({ type: "edit", label: "Edited" }),
        step({ type: "edit", label: "Edited" }),
        step({ type: "bash", label: "Ran", detail: "ls" }),
      ]),
    ).toBe("Used tools, edited files, ran commands");
  });

  it("names the MCP server behind a tool call", () => {
    expect(
      deriveActionGroupSummary([
        step({ type: "tool", label: "mcp__github__create_issue" }),
      ]),
    ).toBe("Used Github");
  });

  it("treats Codex file_change tools as edits", () => {
    expect(
      deriveActionGroupSummary([
        step({ type: "tool", label: "File change", detail: "file_change" }),
      ]),
    ).toBe("Edited files");
  });
});
