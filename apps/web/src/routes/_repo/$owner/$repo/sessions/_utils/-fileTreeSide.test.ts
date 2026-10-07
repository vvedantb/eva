import { describe, expect, it } from "vitest";
import { fileTreeSideFromStorage } from "./-fileTreeSide";

describe("fileTreeSideFromStorage", () => {
  it("reads the opt-in right-hand layout", () => {
    expect(fileTreeSideFromStorage("right")).toBe("right");
  });

  it("reads the stored left-hand layout", () => {
    expect(fileTreeSideFromStorage("left")).toBe("left");
  });

  it("falls back to left for anything else", () => {
    expect(fileTreeSideFromStorage("")).toBe("left");
    expect(fileTreeSideFromStorage("Right")).toBe("left");
    expect(fileTreeSideFromStorage("null")).toBe("left");
  });
});
