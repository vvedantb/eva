import { afterEach, expect, test, vi } from "vitest";
import type * as ConvexClient from "../http/convexClient.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import { sendTurnCompletion } from "../runtime/completion.js";
import {
  beginTurnOwnership,
  endTurnOwnership,
  getCurrentTurnLease,
  type TurnLeaseIdentity,
} from "../runtime/turnLease.js";
import type { JsonObject } from "../types.js";

// Only the network call is faked.
vi.mock("../http/convexClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexClient>()),
  callConvexWithRetry: vi.fn(),
}));

afterEach(() => {
  endTurnOwnership();
  vi.mocked(callConvexWithRetry).mockReset();
});

test("sends a redacted completion after the lease is released", async () => {
  const sent: {
    path: string;
    args: JsonObject;
    leaseAtSend: TurnLeaseIdentity | null;
  }[] = [];
  vi.mocked(callConvexWithRetry).mockImplementation(
    async (_type, path, args) => {
      sent.push({
        path,
        args: { ...args },
        leaseAtSend: getCurrentTurnLease(),
      });
      return null;
    },
  );
  beginTurnOwnership("claim", { turnId: "turn-1", leaseGeneration: 2 });
  const token = "ghs_" + "A1b2C3d4E5f6G7h8I9j0";

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
      // A heartbeat answered `closed` after this point must not read as a
      // takeover (session 225), so the lease is gone before the send.
      leaseAtSend: null,
    },
  ]);
});
