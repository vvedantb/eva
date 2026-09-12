import { describe, expect, test } from "vitest";
import {
  appendSnapshotsToPrompt,
  formatSnapshotPrompt,
  parseSnapshotInbound,
  snapshotChipLabel,
  DEMO_PREVIEW_SNAPSHOT,
} from "./previewSnapshot";

describe("preview snapshot protocol", () => {
  test("accepts a structured snapshot and rejects a missing url", () => {
    expect(
      parseSnapshotInbound({
        type: "eva-preview-snapshot",
        requestId: "r1",
        snapshot: {
          url: "http://localhost:5173/billing",
          title: "Billing",
          loading: false,
          visibleText: "Invoices",
          interactiveElements: [
            {
              role: "button",
              name: "Upgrade",
              selector: "button.upgrade",
              bbox: { x: 1, y: 2, width: 3, height: 4 },
            },
          ],
          accessibilityTree: [{ role: "main", name: "Billing" }],
          consoleEntries: [],
          networkEntries: [],
          screenshot: { dataUrl: "data:image/png;base64,abc" },
        },
      }),
    ).toMatchObject({
      type: "snapshot",
      requestId: "r1",
      snapshot: {
        url: "http://localhost:5173/billing",
        screenshotDataUrl: "data:image/png;base64,abc",
      },
    });
    expect(
      parseSnapshotInbound({
        type: "eva-preview-snapshot",
        requestId: "r1",
        snapshot: { title: "Billing" },
      }),
    ).toBeNull();
  });

  test("accepts a failed capture", () => {
    expect(
      parseSnapshotInbound({
        type: "eva-preview-snapshot-error",
        requestId: "r2",
        message: "Preview isn't ready",
      }),
    ).toEqual({
      type: "error",
      requestId: "r2",
      message: "Preview isn't ready",
    });
  });

  test("prompt block lists controls, console, and network failures", () => {
    const block = formatSnapshotPrompt(DEMO_PREVIEW_SNAPSHOT);
    expect(block).toContain("<preview_snapshot>");
    expect(block).toContain('button "Upgrade" button.upgrade');
    expect(block).toContain("[error] Failed to load invoices: 500");
    expect(block).toContain("500 /api/invoices");
    expect(appendSnapshotsToPrompt("Look at this", [DEMO_PREVIEW_SNAPSHOT])).toBe(
      `Look at this\n\n${block}`,
    );
  });

  test("chip label uses the path and control count", () => {
    expect(snapshotChipLabel(DEMO_PREVIEW_SNAPSHOT)).toBe(
      "Snapshot · /billing · 3 controls",
    );
  });
});
