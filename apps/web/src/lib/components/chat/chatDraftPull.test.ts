import { describe, expect, test } from "vitest";
import {
  ECHO_HISTORY_LIMIT,
  decideDraftPull,
  rememberOwnSave,
} from "./chatDraftPull";

/** A mention token as it is stored on the `drafts` row. */
const mention = (label: string, id: string) => `@[${label}](${id})`;
const ALICE_ID = "j5712abcdefghijk";

const decide = (
  remoteContent: string | null | undefined,
  editorValue: string,
  ownSaves: readonly string[] = [],
) => decideDraftPull({ remoteContent, editorValue, ownSaves });

describe("decideDraftPull leaves the editor alone", () => {
  test("while the subscription is still loading", () => {
    expect(decide(undefined, "")).toEqual({ apply: false, reason: "loading" });
  });

  test("when the row is deleted, rather than wiping what is typed", () => {
    expect(decide(null, "half a sentence")).toEqual({
      apply: false,
      reason: "cleared",
    });
  });

  test("when the row is emptied — clear-on-send must not echo back", () => {
    expect(decide("", "")).toEqual({ apply: false, reason: "cleared" });
  });

  test("when the content is this client's own save coming back", () => {
    expect(decide("typed by me", "typed by me", ["typed by me"])).toEqual({
      apply: false,
      reason: "echo",
    });
  });

  /**
   * The subscription replays every transition, so a keystroke burst can land
   * long after the editor moved on. An echo from earlier in the window is still
   * ours, and re-applying it would resurrect deleted characters.
   */
  test("when an older save in the echo window arrives late", () => {
    const saves = ["a", "ab", "abc"];
    expect(decide("ab", "abc", saves)).toEqual({
      apply: false,
      reason: "echo",
    });
  });

  test("when the editor already holds exactly that text", () => {
    expect(decide("same text", "same text")).toEqual({
      apply: false,
      reason: "unchanged",
    });
  });

  /**
   * The regression that makes the pull dangerous: a row lagging behind the
   * user's latest keystrokes must never be applied, or typed characters vanish.
   */
  test("when the remote row lags what the user has typed", () => {
    expect(decide("hello wor", "hello world")).toEqual({
      apply: false,
      reason: "not-additive",
    });
  });

  test("when the remote row diverges from what the user has typed", () => {
    expect(decide("something else entirely", "hello world")).toEqual({
      apply: false,
      reason: "not-additive",
    });
  });
});

describe("decideDraftPull applies an external seed", () => {
  test("into an empty editor", () => {
    const decision = decide("Please review the plan", "");
    expect(decision.apply).toBe(true);
    if (!decision.apply) return;
    expect(decision.displayText).toBe("Please review the plan");
  });

  test("into a whitespace-only editor", () => {
    const decision = decide("Please review the plan", "   \n ");
    expect(decision.apply).toBe(true);
  });

  /** Exactly the shape `useSeedChatDraft` writes: existing draft + "\n\n" + text. */
  test("appended to the text the editor already holds", () => {
    const decision = decide("half typed\n\nPlease review", "half typed");
    expect(decision.apply).toBe(true);
    if (!decision.apply) return;
    expect(decision.displayText).toBe("half typed\n\nPlease review");
  });

  /**
   * Chips must resolve before the display text referencing them lands, so the
   * maps have to survive the decision — a seed appended to a draft that already
   * mentions someone is the common case.
   */
  test("with the token maps the editor needs to render chips", () => {
    const remote = `${mention("Alice", ALICE_ID)} look\n\nPlease review`;
    const decision = decide(remote, "@Alice look");
    expect(decision.apply).toBe(true);
    if (!decision.apply) return;
    expect(decision.displayText).toBe("@Alice look\n\nPlease review");
    expect(decision.mentionMap.get("Alice")).toBe(ALICE_ID);
  });

  /**
   * The additive comparison runs on display text, not tokens: the editor holds
   * `@Alice` while the row holds `@[Alice](id)`, so comparing raw content would
   * read every mention-carrying seed as a divergence and drop it.
   */
  test("when only the editor's copy of a mention is untokenized", () => {
    const remote = `${mention("Alice", ALICE_ID)}\n\nPlease review`;
    const decision = decide(remote, "@Alice");
    expect(decision.apply).toBe(true);
  });
});

describe("rememberOwnSave", () => {
  test("keeps the newest save last", () => {
    expect(rememberOwnSave(["a"], "b")).toEqual(["a", "b"]);
  });

  test("bounds the window, dropping the oldest entries", () => {
    const history = Array.from(
      { length: ECHO_HISTORY_LIMIT },
      (_, i) => `s${i}`,
    );
    const next = rememberOwnSave(history, "newest");

    expect(next).toHaveLength(ECHO_HISTORY_LIMIT);
    expect(next.at(-1)).toBe("newest");
    expect(next).not.toContain("s0");
    expect(next).toContain("s1");
  });

  test("does not mutate the history it is given", () => {
    const history = ["a"];
    rememberOwnSave(history, "b");
    expect(history).toEqual(["a"]);
  });

  /** The echo guard reads the window this builds; the two must stay in step. */
  test("a save inside the window is still recognised as an echo", () => {
    let history: string[] = [];
    for (let i = 0; i < ECHO_HISTORY_LIMIT; i += 1) {
      history = rememberOwnSave(history, `draft ${i}`);
    }
    expect(decide("draft 0", "draft 63", history).apply).toBe(false);
  });
});
