import { describe, expect, test } from "vitest";
import {
  isEmptyActivityPayload,
  isSandboxStartupActivity,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import type { ActivityStep } from "@eva/ui";

/**
 * Regression guard for the streaming-renderer parse cache (commit 7f38b7770)
 * and the startup collapse (commit 05532b5c7).
 *
 * Every activity consumer — the timeline, the composer todo badge, the
 * sub-agent row, the question cards, the silence clock — now reads through one
 * module-level MRU cache instead of parsing the payload itself. That cache is
 * shared mutable state on the hottest path in the app: a lookup or eviction bug
 * hands one payload's steps to a different payload's reader, which shows up in
 * production as the wrong tool rows in a chat bubble rather than as a crash.
 */

const step = (
  label: string,
  fields: Partial<ActivityStep> = {},
): ActivityStep => ({
  type: "bash",
  label,
  status: "active",
  ...fields,
});

const payload = (...steps: ActivityStep[]): string => JSON.stringify(steps);

describe("parseActivitySteps", () => {
  test("reads a well-formed payload", () => {
    const steps = parseActivitySteps(
      payload(step("Running command..."), step("Reading file...")),
    );
    expect(steps?.map((item) => item.label)).toEqual([
      "Running command...",
      "Reading file...",
    ]);
  });

  test("no payload, an empty one, and legacy plain text carry no steps", () => {
    expect(parseActivitySteps(undefined)).toBeNull();
    expect(parseActivitySteps("")).toBeNull();
    expect(parseActivitySteps("[]")).toBeNull();
    expect(parseActivitySteps("Starting sandbox...")).toBeNull();
  });

  test("an array of things that are not steps carries none", () => {
    expect(parseActivitySteps('[{"foo":1}]')).toBeNull();
    expect(parseActivitySteps('{"steps":[]}')).toBeNull();
  });
});

describe("the parse cache", () => {
  test("one payload string is parsed once and shared by every reader", () => {
    // The shared array is the whole point: seven consumers per streamed token
    // used to parse a payload capped at 600 KB seven times over. Readers must
    // treat it as read-only.
    const data = payload(step("Running command..."));
    expect(parseActivitySteps(data)).toBe(parseActivitySteps(data));
  });

  test("more distinct payloads than the cache holds still read back correctly", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      label: `step ${index}`,
      data: payload(step(`step ${index}`)),
    }));
    for (const item of items) parseActivitySteps(item.data);
    // Reverse order, so the entries evicted by the later reads have to
    // re-parse to themselves rather than to whatever is still resident.
    for (const item of items.toReversed()) {
      expect(parseActivitySteps(item.data)?.[0]?.label).toBe(item.label);
    }
  });

  test("a cached empty payload never reads back as steps, or the other way round", () => {
    // One cache entry answers both questions, so a mix-up here makes a live
    // turn look silent (or a silent one look busy).
    const steps = payload(step("Reading file..."));
    expect(parseActivitySteps("[]")).toBeNull();
    expect(parseActivitySteps(steps)?.length).toBe(1);

    expect(isEmptyActivityPayload("[]")).toBe(true);
    expect(isEmptyActivityPayload(steps)).toBe(false);
    expect(parseActivitySteps(steps)?.length).toBe(1);
    expect(parseActivitySteps("[]")).toBeNull();
  });
});

describe("isEmptyActivityPayload", () => {
  test("only a well-formed payload carrying zero steps is empty", () => {
    // "Nothing to report" has to stay distinguishable from "nothing published
    // yet" — the placeholder copy differs.
    expect(isEmptyActivityPayload("[]")).toBe(true);
    expect(isEmptyActivityPayload(payload(step("Running command...")))).toBe(
      false,
    );
    expect(isEmptyActivityPayload("Starting sandbox...")).toBe(false);
    expect(isEmptyActivityPayload("{}")).toBe(false);
    expect(isEmptyActivityPayload("")).toBe(false);
    expect(isEmptyActivityPayload(undefined)).toBe(false);
  });
});

describe("isSandboxStartupActivity", () => {
  test("a run of nothing but startup plumbing collapses", () => {
    expect(
      isSandboxStartupActivity(
        payload(
          step("Starting sandbox...", { status: "complete" }),
          step("Cloning repository...", { status: "complete" }),
          step("Installing dependencies..."),
        ),
      ),
    ).toBe(true);
  });

  test("one step of real work keeps the whole run expanded", () => {
    expect(
      isSandboxStartupActivity(
        payload(
          step("Starting sandbox...", { status: "complete" }),
          step("Running command..."),
        ),
      ),
    ).toBe(false);
  });

  test("no payload, an empty one, and legacy plain text never collapse", () => {
    expect(isSandboxStartupActivity(undefined)).toBe(false);
    expect(isSandboxStartupActivity("[]")).toBe(false);
    expect(isSandboxStartupActivity("Starting sandbox...")).toBe(false);
  });
});
