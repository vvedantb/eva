import { describe, expect, test } from "vitest";
import { detectCancelSupersession } from "../convex/_chat/cancelRace";

describe("detectCancelSupersession", () => {
  test("owns the turn when nothing newer staged or tracked", () => {
    expect(
      detectCancelSupersession({
        latestPendingTurn: { requestedAt: 10 },
        cancelPendingRequestedAt: 10,
        latestActiveWorkflowId: "wf-1",
        cancelWorkflowId: "wf-1",
      }),
    ).toEqual({
      newerTurnStaged: false,
      newerWorkflowTracked: false,
      cancelOwnsCurrentTurn: true,
    });
  });

  test("detects a newer staged prompt", () => {
    const result = detectCancelSupersession({
      latestPendingTurn: { requestedAt: 20 },
      cancelPendingRequestedAt: 10,
      latestActiveWorkflowId: "wf-1",
      cancelWorkflowId: "wf-1",
    });
    expect(result.newerTurnStaged).toBe(true);
    expect(result.cancelOwnsCurrentTurn).toBe(false);
  });

  test("detects a different tracked workflow", () => {
    const result = detectCancelSupersession({
      latestActiveWorkflowId: "wf-2",
      cancelWorkflowId: "wf-1",
    });
    expect(result.newerWorkflowTracked).toBe(true);
    expect(result.cancelOwnsCurrentTurn).toBe(false);
  });
});
