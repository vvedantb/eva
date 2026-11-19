import { describe, expect, it } from "vitest";
import { placeChatUiPanels } from "@eva/shared";

const panel = (id: string, createdAt: number, messageId?: string) => ({
  _id: id,
  createdAt,
  ...(messageId !== undefined ? { messageId } : {}),
});
const row = (id: string, at: number) => ({ _id: id, _creationTime: at });

describe("placeChatUiPanels", () => {
  it("groups panels under their anchor message in creation order", () => {
    const { byMessageId, trailing } = placeChatUiPanels(
      [panel("b", 20, "m1"), panel("a", 10, "m1"), panel("c", 30, "m2")],
      [row("m1", 5), row("m2", 25)],
      false,
    );
    expect(byMessageId.get("m1")?.map((p) => p._id)).toEqual(["a", "b"]);
    expect(byMessageId.get("m2")?.map((p) => p._id)).toEqual(["c"]);
    expect(trailing).toEqual([]);
  });

  it("puts a panel with a hidden anchor under the newest earlier row", () => {
    const { byMessageId, trailing } = placeChatUiPanels(
      [panel("a", 15), panel("b", 35, "hidden")],
      [row("m1", 10), row("m2", 20), row("m3", 40)],
      false,
    );
    expect(byMessageId.get("m1")?.map((p) => p._id)).toEqual(["a"]);
    expect(byMessageId.get("m2")?.map((p) => p._id)).toEqual(["b"]);
    expect(trailing).toEqual([]);
  });

  it("holds back panels older than the loaded window", () => {
    const { byMessageId, trailing } = placeChatUiPanels(
      [panel("old", 5, "unloaded")],
      [row("m1", 10)],
      true,
    );
    expect(byMessageId.size).toBe(0);
    expect(trailing).toEqual([]);
  });

  it("trails a panel older than every row once all history is loaded", () => {
    const { trailing } = placeChatUiPanels(
      [panel("a", 5)],
      [row("m1", 10)],
      false,
    );
    expect(trailing.map((p) => p._id)).toEqual(["a"]);
  });
});
