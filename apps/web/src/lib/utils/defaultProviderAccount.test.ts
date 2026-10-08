import { describe, expect, test } from "vitest";
import {
  defaultProviderAccountId,
  providerAccountIdForModel,
} from "./defaultProviderAccount";

/**
 * A teammate's shared account bills its owner, so it may only ever be an
 * explicit pick. New sessions and quick tasks used to auto-default to whichever
 * account matched the model's provider first, which silently spent a
 * teammate's credential the moment they shared one (fix 4b948b101). Own-ness,
 * not sharedness, is the gate: an own account can be shared too.
 */

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

  // The regression: a teammate's share sorted ahead of (or instead of) an own
  // account must never be auto-selected — Team (null) is the safe default.
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

  // An unset model resolves to the claude provider, so the picker still lands
  // on a real account rather than Team on a first render with no model yet.
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

  // Switching provider cannot carry a credential for the wrong provider, so it
  // re-defaults — and re-defaulting is own-only, back to Team if need be.
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
