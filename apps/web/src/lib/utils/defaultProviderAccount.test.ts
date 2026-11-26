import { describe, expect, test } from "bun:test";
import {
  defaultProviderAccountId,
  providerAccountIdForModel,
} from "./defaultProviderAccount";

const OWN_CLAUDE = { id: "own-claude", provider: "claude", isOwn: true };
const OWN_CODEX = { id: "own-codex", provider: "codex", isOwn: true };
const TEAMMATE_CLAUDE = {
  id: "mate-claude",
  provider: "claude",
  isOwn: false,
};
const TEAMMATE_CODEX = { id: "mate-codex", provider: "codex", isOwn: false };

describe("defaultProviderAccountId", () => {
  test("picks the creator's own account for the model's provider", () => {
    expect(
      defaultProviderAccountId([OWN_CLAUDE, OWN_CODEX], "claude:opus"),
    ).toBe("own-claude");
    expect(
      defaultProviderAccountId([OWN_CLAUDE, OWN_CODEX], "codex:gpt-5.6"),
    ).toBe("own-codex");
  });

  test("never defaults to a teammate's shared account", () => {
    expect(
      defaultProviderAccountId([TEAMMATE_CLAUDE], "claude:opus"),
    ).toBeNull();
    expect(
      defaultProviderAccountId(
        [TEAMMATE_CLAUDE, OWN_CLAUDE],
        "claude:opus",
      ),
    ).toBe("own-claude");
  });

  test("falls back to Team when no own account matches the provider", () => {
    expect(
      defaultProviderAccountId([OWN_CODEX, TEAMMATE_CLAUDE], "claude:opus"),
    ).toBeNull();
    expect(defaultProviderAccountId([], "claude:opus")).toBeNull();
  });

  test("treats a missing model as the claude provider", () => {
    expect(defaultProviderAccountId([OWN_CODEX, OWN_CLAUDE], null)).toBe(
      "own-claude",
    );
    expect(defaultProviderAccountId([OWN_CODEX, OWN_CLAUDE], undefined)).toBe(
      "own-claude",
    );
  });
});

describe("providerAccountIdForModel", () => {
  test("keeps an explicit pick that still matches the new model", () => {
    expect(
      providerAccountIdForModel(
        [OWN_CLAUDE, TEAMMATE_CLAUDE],
        "mate-claude",
        "claude:haiku",
      ),
    ).toBe("mate-claude");
  });

  test("re-defaults when the model changes provider", () => {
    expect(
      providerAccountIdForModel(
        [OWN_CLAUDE, OWN_CODEX],
        "own-claude",
        "codex:gpt-5.6",
      ),
    ).toBe("own-codex");
    expect(
      providerAccountIdForModel(
        [OWN_CLAUDE, TEAMMATE_CODEX],
        "own-claude",
        "codex:gpt-5.6",
      ),
    ).toBeNull();
  });

  test("re-defaults when the current pick no longer resolves", () => {
    expect(
      providerAccountIdForModel([OWN_CLAUDE], "deleted-id", "claude:opus"),
    ).toBe("own-claude");
    expect(
      providerAccountIdForModel([OWN_CLAUDE], null, "claude:opus"),
    ).toBe("own-claude");
  });
});
