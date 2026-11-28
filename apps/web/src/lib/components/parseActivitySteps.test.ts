import { describe, expect, test } from "bun:test";
import {
  isEmptyActivityPayload,
  isSandboxStartupActivity,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import type { ActivityStep } from "@vvedantb/ui";

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
    const data = payload(step("Running command..."));
    expect(parseActivitySteps(data)).toBe(parseActivitySteps(data));
  });

  test("more distinct payloads than the cache holds still read back correctly", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      label: `step ${index}`,
      data: payload(step(`step ${index}`)),
    }));
    for (const item of items) parseActivitySteps(item.data);
    for (const item of items.toReversed()) {
      expect(parseActivitySteps(item.data)?.[0]?.label).toBe(item.label);
    }
  });

  test("a cached empty payload never reads back as steps, or the other way round", () => {
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

  test("planned stages still pending keep the run collapsed", () => {
    expect(
      isSandboxStartupActivity(
        payload(
          step("Fetching base branch..."),
          step("Restoring seeded runtime...", { status: "pending" }),
          step("Running startup commands...", { status: "pending" }),
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
