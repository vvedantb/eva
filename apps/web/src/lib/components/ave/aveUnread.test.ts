import { describe, expect, it } from "vitest";
import { aveHasUnread } from "@/lib/components/ave/aveUnread";

const reply = { role: "assistant" as const, timestamp: 100, finishedAt: 200 };

describe("aveHasUnread", () => {
  it("is unread when Ave finished a reply after the last read", () => {
    expect(aveHasUnread({ status: "idle", readAt: 150 }, [reply])).toBe(true);
  });

  it("is unread when the chat was never read", () => {
    expect(aveHasUnread({ status: "idle" }, [reply])).toBe(true);
  });

  it("is read once the chat was on screen after the reply", () => {
    expect(aveHasUnread({ status: "idle", readAt: 250 }, [reply])).toBe(false);
  });

  it("is not unread while a run is in flight", () => {
    expect(aveHasUnread({ status: "running" }, [reply])).toBe(false);
  });

  it("is not unread when the user spoke last", () => {
    expect(
      aveHasUnread({ status: "idle" }, [
        reply,
        { role: "user", timestamp: 300 },
      ]),
    ).toBe(false);
  });

  it("is not unread with no thread or no messages", () => {
    expect(aveHasUnread(null, [reply])).toBe(false);
    expect(aveHasUnread({ status: "idle" }, [])).toBe(false);
  });
});
