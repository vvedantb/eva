import { describe, expect, test } from "bun:test";
import {
  claudeUsageBodyFromUnifiedHeaders,
  claudeUsageBodySchema,
  hasPlanRateLimits,
  readClaudeUsageWindows,
  readUnifiedRateLimitHeaders,
} from "../convex/_usageLimits/claudeUsage";

function parse(body: object) {
  const parsed = claudeUsageBodySchema.safeParse(body);
  if (!parsed.success) throw new Error("expected the body to parse");
  return parsed.data;
}

describe("hasPlanRateLimits", () => {
  test("an HTTP 200 error envelope reports no rate limits", () => {
    expect(
      hasPlanRateLimits(parse({ error: { type: "invalid_request" } })),
    ).toBe(false);
    expect(hasPlanRateLimits(parse({}))).toBe(false);
  });

  test("a populated window counts; an empty limits array does not", () => {
    expect(hasPlanRateLimits(parse({ five_hour: { utilization: 0 } }))).toBe(
      true,
    );
    expect(hasPlanRateLimits(parse({ limits: [] }))).toBe(false);
    expect(
      hasPlanRateLimits(
        parse({
          limits: [
            {
              kind: "weekly_scoped",
              percent: 10,
              scope: { model: { display_name: "Opus" } },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  test("a nested SDK-shaped body is still a usage report", () => {
    expect(
      hasPlanRateLimits(
        parse({
          rate_limits_available: true,
          rate_limits: { five_hour: { utilization: 12 } },
        }),
      ),
    ).toBe(true);
    expect(
      readClaudeUsageWindows(
        parse({
          rate_limits: {
            seven_day: { utilization: 4 },
            five_hour: { utilization: 12 },
          },
        }),
      ).map((window) => window.key),
    ).toEqual(["five_hour", "seven_day"]);
  });
});

describe("readClaudeUsageWindows", () => {
  test("fixed windows come back in display order with their labels", () => {
    const windows = readClaudeUsageWindows(
      parse({
        seven_day_sonnet: { utilization: 4 },
        five_hour: { utilization: 12 },
        seven_day_oauth_apps: { utilization: 1 },
        seven_day: { utilization: 30 },
        seven_day_opus: { utilization: 55 },
      }),
    );
    expect(windows.map((window) => window.key)).toEqual([
      "five_hour",
      "seven_day",
      "seven_day_opus",
      "seven_day_sonnet",
      "seven_day_oauth_apps",
    ]);
    expect(windows.map((window) => window.label)).toEqual([
      "5h",
      "Weekly (all models)",
      "Weekly (Opus)",
      "Weekly (Sonnet)",
      "Weekly (apps)",
    ]);
  });

  test("the two reset encodings both land on epoch ms", () => {
    const resetsAtMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    const windows = readClaudeUsageWindows(
      parse({
        five_hour: {
          utilization: 12,
          resets_at: new Date(resetsAtMs).toISOString(),
        },
        limits: [
          {
            kind: "weekly_scoped",
            percent: 40,
            resets_at: resetsAtMs / 1000,
            scope: { model: { display_name: "Opus 5" } },
          },
        ],
      }),
    );
    expect(windows).toEqual([
      { key: "five_hour", label: "5h", utilization: 12, resetsAt: resetsAtMs },
      {
        key: "model_scoped:Opus 5",
        label: "Weekly (Opus 5)",
        utilization: 40,
        resetsAt: resetsAtMs,
      },
    ]);
  });

  test("an unparseable reset is dropped rather than stored as NaN", () => {
    expect(
      readClaudeUsageWindows(
        parse({ five_hour: { utilization: 3, resets_at: "not a date" } }),
      ),
    ).toEqual([{ key: "five_hour", label: "5h", utilization: 3 }]);
  });

  test("a window with neither a number nor a reset has nothing to show", () => {
    expect(
      readClaudeUsageWindows(
        parse({
          five_hour: { utilization: null, resets_at: null },
          seven_day: { utilization: 7 },
        }),
      ).map((window) => window.key),
    ).toEqual(["seven_day"]);
  });

  test("only weekly_scoped limits with a model name become windows", () => {
    expect(
      readClaudeUsageWindows(
        parse({
          limits: [
            { kind: "weekly_scoped", percent: 10 },
            {
              kind: "something_else",
              percent: 20,
              scope: { model: { display_name: "Opus 5" } },
            },
            {
              kind: "weekly_scoped",
              percent: 30,
              scope: { model: { display_name: "Sonnet 5" } },
            },
          ],
        }),
      ).map((window) => window.key),
    ).toEqual(["model_scoped:Sonnet 5"]);
  });

  test("extra usage is excluded — it meters spend, not headroom", () => {
    expect(
      readClaudeUsageWindows(
        parse({
          five_hour: { utilization: 5 },
          extra_usage: { utilization: 98, resets_at: null },
        }),
      ).map((window) => window.key),
    ).toEqual(["five_hour"]);
  });
});

describe("unified inference headers", () => {
  test("a 0–1 fraction and unix-seconds reset become a percent window", () => {
    const resetsAtMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    const headers: Record<string, string> = {
      "anthropic-ratelimit-unified-5h-utilization": "0.01",
      "anthropic-ratelimit-unified-5h-reset": String(resetsAtMs / 1000),
      "anthropic-ratelimit-unified-7d-utilization": "0.63",
      "anthropic-ratelimit-unified-7d-reset": String(resetsAtMs / 1000),
    };
    const body = claudeUsageBodyFromUnifiedHeaders((name) => headers[name]);
    expect(body, "headers should produce a usage body").not.toBeNull();
    if (body === null) return;
    expect(hasPlanRateLimits(body)).toBe(true);
    expect(readClaudeUsageWindows(body)).toEqual([
      {
        key: "five_hour",
        label: "5h",
        utilization: 1,
        resetsAt: resetsAtMs,
      },
      {
        key: "seven_day",
        label: "Weekly (all models)",
        utilization: 63,
        resetsAt: resetsAtMs,
      },
    ]);
  });

  test("the 7d_oi claim becomes Weekly (Fable)", () => {
    const resetsAtMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    const headers: Record<string, string> = {
      "anthropic-ratelimit-unified-5h-utilization": "0.5",
      "anthropic-ratelimit-unified-5h-reset": String(resetsAtMs / 1000),
      "anthropic-ratelimit-unified-7d-utilization": "0.4",
      "anthropic-ratelimit-unified-7d-reset": String(resetsAtMs / 1000),
      "anthropic-ratelimit-unified-7d_oi-utilization": "0.12",
      "anthropic-ratelimit-unified-7d_oi-reset": String(resetsAtMs / 1000),
    };
    const body = claudeUsageBodyFromUnifiedHeaders((name) => headers[name]);
    expect(body, "headers should produce a usage body").not.toBeNull();
    if (body === null) return;
    expect(readClaudeUsageWindows(body)).toEqual([
      {
        key: "five_hour",
        label: "5h",
        utilization: 50,
        resetsAt: resetsAtMs,
      },
      {
        key: "seven_day",
        label: "Weekly (all models)",
        utilization: 40,
        resetsAt: resetsAtMs,
      },
      {
        key: "model_scoped:Fable",
        label: "Weekly (Fable)",
        utilization: 12,
        resetsAt: resetsAtMs,
      },
    ]);
  });

  test("the probe sees no weekly beyond all-models and Fable", () => {
    expect(
      readUnifiedRateLimitHeaders((name) =>
        name.endsWith("-utilization") ? "0.5" : undefined,
      ).map((window) => window.key),
    ).toEqual(["five_hour", "seven_day", "model_scoped:Fable"]);
  });

  test("headers with no unified windows produce no body", () => {
    expect(claudeUsageBodyFromUnifiedHeaders(() => undefined)).toBeNull();
    expect(readUnifiedRateLimitHeaders(() => "")).toEqual([]);
    expect(readUnifiedRateLimitHeaders(() => "not a number")).toEqual([]);
  });
});

describe("limits[] stands in for the legacy top-level windows", () => {
  test("session and weekly_all fill 5h and Weekly (all models)", () => {
    const resetsAtMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    const windows = readClaudeUsageWindows(
      parse({
        five_hour: null,
        seven_day: null,
        limits: [
          { kind: "session", percent: 61, resets_at: resetsAtMs / 1000 },
          { kind: "weekly_all", percent: 23 },
          {
            kind: "weekly_scoped",
            percent: 12,
            scope: { model: { display_name: "Fable" } },
          },
        ],
      }),
    );
    expect(windows).toEqual([
      { key: "five_hour", label: "5h", utilization: 61, resetsAt: resetsAtMs },
      { key: "seven_day", label: "Weekly (all models)", utilization: 23 },
      { key: "model_scoped:Fable", label: "Weekly (Fable)", utilization: 12 },
    ]);
  });

  test("a body carrying only limits[] is still a usage report", () => {
    expect(
      hasPlanRateLimits(parse({ limits: [{ kind: "session", percent: 4 }] })),
    ).toBe(true);
  });

  test("a top-level window wins over the same window in limits[]", () => {
    expect(
      readClaudeUsageWindows(
        parse({
          five_hour: { utilization: 70 },
          limits: [
            { kind: "session", percent: 61 },
            { kind: "weekly_all", percent: 23 },
          ],
        }),
      ),
    ).toEqual([
      { key: "five_hour", label: "5h", utilization: 70 },
      { key: "seven_day", label: "Weekly (all models)", utilization: 23 },
    ]);
  });

  test("a repeated kind does not stack a second row on the same window", () => {
    expect(
      readClaudeUsageWindows(
        parse({
          limits: [
            { kind: "session", percent: 61 },
            { kind: "session", percent: 12 },
          ],
        }),
      ),
    ).toEqual([{ key: "five_hour", label: "5h", utilization: 61 }]);
  });
});

describe("scoped limit resets", () => {
  test("limits[].resets_at accepts an ISO string", () => {
    const resetsAtMs = Date.UTC(2026, 7, 25, 12, 0, 0);
    expect(
      readClaudeUsageWindows(
        parse({
          limits: [
            {
              kind: "weekly_scoped",
              percent: 54,
              resets_at: new Date(resetsAtMs).toISOString(),
              scope: { model: { display_name: "Fable" } },
            },
          ],
        }),
      ),
    ).toEqual([
      {
        key: "model_scoped:Fable",
        label: "Weekly (Fable)",
        utilization: 54,
        resetsAt: resetsAtMs,
      },
    ]);
  });
});
