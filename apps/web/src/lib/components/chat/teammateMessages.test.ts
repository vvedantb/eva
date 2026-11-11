import { describe, expect, test } from "vitest";
import {
  firstNameByUserId,
  firstNameFromUser,
  isOtherUserChatMessage,
  otherUserIdsInChat,
} from "@eva/shared";

// The web chat and the phone chat both read these to draw a teammate's turn
// on the left with their name, so they live in `@eva/shared`.
describe("isOtherUserChatMessage", () => {
  test("a user turn from someone else is a teammate's", () => {
    expect(isOtherUserChatMessage({ role: "user", userId: "them" }, "me")).toBe(
      true,
    );
  });

  test("your own turn, a reply, an alert or a missing id is not", () => {
    expect(isOtherUserChatMessage({ role: "user", userId: "me" }, "me")).toBe(
      false,
    );
    expect(
      isOtherUserChatMessage({ role: "assistant", userId: "them" }, "me"),
    ).toBe(false);
    expect(
      isOtherUserChatMessage(
        { role: "user", userId: "them", isSystemAlert: true },
        "me",
      ),
    ).toBe(false);
    expect(isOtherUserChatMessage({ role: "user" }, "me")).toBe(false);
    expect(
      isOtherUserChatMessage({ role: "user", userId: "them" }, undefined),
    ).toBe(false);
  });
});

describe("otherUserIdsInChat", () => {
  test("lists each teammate once, sorted", () => {
    expect(
      otherUserIdsInChat(
        [
          { role: "user", userId: "me" },
          { role: "user", userId: "zoe" },
          { role: "assistant" },
          { role: "user", userId: "ann" },
          { role: "user", userId: "zoe" },
        ],
        "me",
      ),
    ).toEqual(["ann", "zoe"]);
  });
});

describe("firstNameFromUser", () => {
  test("prefers the first name, else the first word of the full name", () => {
    expect(firstNameFromUser({ firstName: " Ann ", fullName: "X Y" })).toBe(
      "Ann",
    );
    expect(firstNameFromUser({ fullName: "Zoe Example" })).toBe("Zoe");
    expect(firstNameFromUser({ firstName: " ", fullName: null })).toBeNull();
  });
});

describe("firstNameByUserId", () => {
  test("maps each named profile to its first name and skips the nameless", () => {
    expect(
      firstNameByUserId([
        { _id: "a", firstName: "Ann" },
        { _id: "z", fullName: "Zoe Example" },
        { _id: "n" },
      ]),
    ).toEqual(
      new Map([
        ["a", "Ann"],
        ["z", "Zoe"],
      ]),
    );
  });
});
