import { afterEach, expect, mock, test } from "bun:test";
import {
  beginTurnOwnership,
  endTurnOwnership,
  getCurrentTurnLease,
  type TurnLeaseIdentity,
} from "../runtime/turnLease.js";
import type { JsonObject } from "../types.js";

const realClient = { ...(await import("../http/convexClient.js")) };
const callConvexWithRetry = mock<typeof realClient.callConvexWithRetry>();
mock.module("../http/convexClient.js", () => ({
  ...realClient,
  callConvexWithRetry,
}));
const { sendTurnCompletion } = await import("../runtime/completion.js");

afterEach(() => {
  endTurnOwnership();
  callConvexWithRetry.mockReset();
});

test("sends a redacted completion after the lease is released", async () => {
  const sent: {
    path: string;
    args: JsonObject;
    leaseAtSend: TurnLeaseIdentity | null;
  }[] = [];
  callConvexWithRetry.mockImplementation(async (_type, path, args) => {
    sent.push({
      path,
      args: { ...args },
      leaseAtSend: getCurrentTurnLease(),
    });
    return null;
  });
  beginTurnOwnership("claim", { turnId: "turn-1", leaseGeneration: 2 });
  const token = ["ghs", "A1b2C3d4E5f6G7h8I9j0"].join("_");

  await sendTurnCompletion("sessionWorkflow:completeTurn", {
    success: false,
    result: "Pushed with " + token,
    error: "git push https://x-access-token:" + token + "@github.com failed",
    rawResultEvent: JSON.stringify({ result: token }),
    turnId: "turn-1",
    leaseGeneration: 2,
  });

  expect(sent).toEqual([
    {
      path: "sessionWorkflow:completeTurn",
      args: {
        success: false,
        result: "Pushed with ***",
        error: "git push https://x-access-token:***@github.com failed",
        rawResultEvent: JSON.stringify({ result: "***" }),
        turnId: "turn-1",
        leaseGeneration: 2,
      },
      leaseAtSend: null,
    },
  ]);
});
