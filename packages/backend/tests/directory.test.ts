import { describe, expect, test } from "bun:test";
import { collectDirectoryUserIds } from "../convex/_users/directory";

describe("collectDirectoryUserIds", () => {
  test("always includes self and unique teammates", () => {
    expect(collectDirectoryUserIds("me", [])).toEqual(["me"]);
    expect(
      collectDirectoryUserIds("me", [
        { userId: "ann" },
        { userId: "me" },
        { userId: "ann" },
        { userId: "zoe" },
      ]),
    ).toEqual(["me", "ann", "zoe"]);
  });
});
