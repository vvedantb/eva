import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import {
  armPreviewMiniPlayer,
  closePreviewMiniPlayer,
  disarmPreviewMiniPlayer,
  dropPreviewMiniPlayerForSandbox,
  getArmedPreviewMiniPlayer,
  getPreviewMiniPlayer,
  notePreviewAnchorAttached,
  notePreviewAnchorDetached,
  openPreviewMiniPlayer,
  type PreviewMiniPlayerTarget,
} from "./previewMiniPlayerStore";

/**
 * The mini-player must float exactly when the user leaves a visible preview
 * behind — not on the keyed remounts the pane performs while it stays on
 * screen, and not after the user dismissed it. The host reports attach and
 * detach; this store decides.
 */

const sessionId = z.custom<Id<"sessions">>().parse("sess_1");

function target(
  overrides: Partial<PreviewMiniPlayerTarget> = {},
): PreviewMiniPlayerTarget {
  return {
    entryKey: "eva:session:s1:preview-path:p1:3000",
    group: "sbx_a:3000",
    src: "https://a-3000.vercel.run/",
    epoch: 1,
    sessionId,
    sandboxId: "sbx_a",
    returnTo: "/acme/app/sessions/12/preview",
    title: "Fix the header",
    ...overrides,
  };
}

/** queueMicrotask callbacks run once the current task yields. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  closePreviewMiniPlayer();
  disarmPreviewMiniPlayer(target().entryKey);
});

describe("auto float", () => {
  test("an armed anchor that detaches floats after a microtask", async () => {
    const armed = target();
    armPreviewMiniPlayer(armed);

    notePreviewAnchorDetached(armed.entryKey);
    expect(getPreviewMiniPlayer()).toBeNull();

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toEqual({ ...armed, mode: "auto" });
  });

  test("re-attaching in the same tick cancels the float", async () => {
    const armed = target();
    armPreviewMiniPlayer(armed);

    notePreviewAnchorDetached(armed.entryKey);
    notePreviewAnchorAttached(armed.entryKey, "panel");

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toBeNull();
  });

  test("an unarmed anchor never floats", async () => {
    notePreviewAnchorDetached(target().entryKey);

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toBeNull();
  });

  test("disarming before the microtask cancels the float", async () => {
    const armed = target();
    armPreviewMiniPlayer(armed);

    notePreviewAnchorDetached(armed.entryKey);
    disarmPreviewMiniPlayer(armed.entryKey);

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toBeNull();
  });
});

describe("pane attach", () => {
  test("closes an auto mini-player for the same key", () => {
    openPreviewMiniPlayer({ ...target(), mode: "auto" });

    notePreviewAnchorAttached(target().entryKey, "panel");

    expect(getPreviewMiniPlayer()).toBeNull();
  });

  test("leaves a manual mini-player open", () => {
    const manual = { ...target(), mode: "manual" as const };
    openPreviewMiniPlayer(manual);

    notePreviewAnchorAttached(manual.entryKey, "panel");

    expect(getPreviewMiniPlayer()).toEqual(manual);
  });

  test("leaves an auto mini-player for another key open", () => {
    const other = { ...target({ entryKey: "other" }), mode: "auto" as const };
    openPreviewMiniPlayer(other);

    notePreviewAnchorAttached(target().entryKey, "panel");

    expect(getPreviewMiniPlayer()).toEqual(other);
  });

  test("the mini-player's own anchor does not close it", () => {
    const auto = { ...target(), mode: "auto" as const };
    openPreviewMiniPlayer(auto);

    notePreviewAnchorAttached(auto.entryKey, "miniPlayer");

    expect(getPreviewMiniPlayer()).toEqual(auto);
  });
});

describe("close", () => {
  test("disarms, so the mini-player's own detach does not re-float", async () => {
    const armed = target();
    armPreviewMiniPlayer(armed);
    openPreviewMiniPlayer({ ...armed, mode: "manual" });

    closePreviewMiniPlayer();
    expect(getArmedPreviewMiniPlayer()).toBeNull();
    notePreviewAnchorDetached(armed.entryKey);

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toBeNull();
  });

  test("an open mini-player's anchor detaching does not open a second", async () => {
    const armed = target();
    armPreviewMiniPlayer(armed);
    const manual = { ...armed, mode: "manual" as const };
    openPreviewMiniPlayer(manual);

    notePreviewAnchorDetached(armed.entryKey);

    await flushMicrotasks();
    expect(getPreviewMiniPlayer()).toEqual(manual);
  });
});

describe("sandbox drop", () => {
  test("closes and disarms a matching sandbox", () => {
    armPreviewMiniPlayer(target());
    openPreviewMiniPlayer({ ...target(), mode: "manual" });

    dropPreviewMiniPlayerForSandbox("sbx_a");

    expect(getPreviewMiniPlayer()).toBeNull();
    expect(getArmedPreviewMiniPlayer()).toBeNull();
  });

  test("spares another sandbox", () => {
    const manual = { ...target(), mode: "manual" as const };
    openPreviewMiniPlayer(manual);

    dropPreviewMiniPlayerForSandbox("sbx_b");

    expect(getPreviewMiniPlayer()).toEqual(manual);
  });
});
