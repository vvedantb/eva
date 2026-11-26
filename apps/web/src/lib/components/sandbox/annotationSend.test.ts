import { describe, expect, test } from "bun:test";
import { annotationSender } from "./annotationSend";

const ANNOTATION = { pagePath: "/home", element: "<button.primary>" };

function harness(isExecuting: boolean, sendFails = false) {
  const calls: string[] = [];
  const submit = annotationSender({
    isExecuting,
    enqueue: async (display, full, annotation) => {
      calls.push(`enqueue:${display}:${full}:${annotation.pagePath}`);
    },
    send: async (display, full, annotation) => {
      if (sendFails) throw new Error("boom");
      calls.push(`send:${display}:${full}:${annotation.pagePath}`);
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
    await submit("short", "rich", ANNOTATION);
    expect(calls).toEqual(["enqueue:short:rich:/home"]);
  });

  test("sends when idle", async () => {
    const { calls, submit } = harness(false);
    await submit("short", "rich", ANNOTATION);
    expect(calls).toEqual(["send:short:rich:/home"]);
  });

  test("posts a failed send into the chat", async () => {
    const { calls, submit } = harness(false, true);
    await submit("short", "rich", ANNOTATION);
    expect(calls).toEqual(["error:Error: boom"]);
  });
});
