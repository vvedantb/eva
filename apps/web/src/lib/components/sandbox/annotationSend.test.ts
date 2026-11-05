import { describe, expect, test } from "vitest";
import { annotationSender } from "./annotationSend";

function harness(isExecuting: boolean, sendFails = false) {
  const calls: string[] = [];
  const submit = annotationSender({
    isExecuting,
    enqueue: async (display, full) => {
      calls.push(`enqueue:${display}:${full}`);
    },
    send: async (display, full) => {
      if (sendFails) throw new Error("boom");
      calls.push(`send:${display}:${full}`);
    },
    postError: async (content) => {
      calls.push(`error:${content}`);
    },
  });
  return { calls, submit };
}

describe("annotationSender", () => {
  test("queues while a turn runs", async () => {
    const { calls, submit } = harness(true);
    await submit("short", "rich");
    expect(calls).toEqual(["enqueue:short:rich"]);
  });

  test("sends when idle", async () => {
    const { calls, submit } = harness(false);
    await submit("short", "rich");
    expect(calls).toEqual(["send:short:rich"]);
  });

  test("posts a failed send into the chat", async () => {
    const { calls, submit } = harness(false, true);
    await submit("short", "rich");
    expect(calls).toEqual(["error:Error: boom"]);
  });
});
