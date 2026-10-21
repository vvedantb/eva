import { describe, expect, it } from "vitest";
import { parseStoredDraft } from "./useNewSessionComposerState";

// Regression guard for commit 37bca3ffc (#1011).
//
// The new-session composer used to persist model, traits and provider account
// in `eva:new-session-composer:<repoId>`, so a stale pick overrode the repo
// default model on every later visit. Users still hold those old blobs, so the
// reader must keep the draft and drop everything else.

describe("parseStoredDraft", () => {
  it("drops a stored model, traits and account from an old blob", () => {
    const legacyBlob = JSON.stringify({
      draft: "fix the login bug",
      model: "codex:gpt-5.6",
      effortLevel: "max",
      fastMode: true,
      providerAccountId: "shared-account-id",
    });
    expect(parseStoredDraft(legacyBlob)).toStrictEqual({
      draft: "fix the login bug",
    });
  });

  it("falls back to an empty draft for unreadable values", () => {
    expect(parseStoredDraft("not json")).toStrictEqual({ draft: "" });
    expect(
      parseStoredDraft(JSON.stringify({ model: "claude:opus" })),
    ).toStrictEqual({ draft: "" });
    expect(parseStoredDraft(JSON.stringify({ draft: 42 }))).toStrictEqual({
      draft: "",
    });
  });
});
