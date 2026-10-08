import { describe, expect, it } from "vitest";
import { placeChatUiPanels } from "./chatUiPanelPlacement";

const panel = (id: string, createdAt: number, messageId?: string) => ({
  _id: id,
  createdAt,
  ...(messageId !== undefined ? { messageId } : {}),
});

describe("placeChatUiPanels", () => {
  it("groups panels under their anchor message in creation order", () => {
    const { byMessageId, trailing } = placeChatUiPanels(
      [panel("b", 20, "m1"), panel("a", 10, "m1"), panel("c", 30, "m2")],
      new Set(["m1", "m2"]),
    );
    expect(byMessageId.get("m1")?.map((p) => p._id)).toEqual(["a", "b"]);
    expect(byMessageId.get("m2")?.map((p) => p._id)).toEqual(["c"]);
    expect(trailing).toEqual([]);
  });

  it("trails panels whose anchor is missing, so none are dropped", () => {
    const { byMessageId, trailing } = placeChatUiPanels(
      [panel("a", 10), panel("b", 20, "hidden")],
      new Set(["m1"]),
    );
    expect(byMessageId.size).toBe(0);
    expect(trailing.map((p) => p._id)).toEqual(["a", "b"]);
  });
});
