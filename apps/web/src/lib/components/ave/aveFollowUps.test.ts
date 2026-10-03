import { describe, expect, it } from "vitest";
import type { ChatBodyMessage } from "@/lib/components/chat/chatBodyUtils";
import { splitAveFollowUps } from "@/lib/components/ave/aveFollowUps";

let clock = 0;
function row(
  role: ChatBodyMessage["role"],
  content: string,
  extra: Partial<ChatBodyMessage> = {},
): ChatBodyMessage {
  clock += 1;
  return {
    _id: `m${clock}`,
    _creationTime: clock,
    role,
    content,
    timestamp: clock,
    ...extra,
  };
}

describe("splitAveFollowUps", () => {
  const ask = row("user", "start a task");
  const streaming = row("assistant", "");
  const followUp = row("user", "also check the PR");
  const notification = row("user", "[agent-notification] done", {
    orchestratorNotification: true,
  });

  it("holds user messages sent after the reply that is streaming", () => {
    const { transcript, followUps } = splitAveFollowUps(
      [ask, streaming, followUp, notification],
      true,
    );
    expect(transcript.map((m) => m._id)).toEqual([
      ask._id,
      streaming._id,
      notification._id,
    ]);
    expect(followUps).toEqual([
      { id: followUp._id, content: followUp.content, userId: undefined },
    ]);
  });

  it("leaves the transcript alone when idle", () => {
    const messages = [ask, row("assistant", "done", { finishedAt: 1 }), followUp];
    expect(splitAveFollowUps(messages, false)).toEqual({
      transcript: messages,
      followUps: [],
    });
  });

  it("holds nothing before the run opens its reply", () => {
    // The run has not claimed yet, so it will read this message itself.
    const messages = [ask, followUp];
    expect(splitAveFollowUps(messages, true).followUps).toEqual([]);
  });
});
