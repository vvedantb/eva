import { describe, expect, it } from "vitest";
import {
  readBoolean,
  readChoice,
  readConfidence,
  readScore,
} from "../convex/_jev/answers";
import type { EvaluateOutcome } from "../convex/_jev/schema";

/**
 * Feature code reads one answer at a time and falls back when it is missing,
 * so every reader has to be total: a failed call, an id Jev did not answer,
 * and an answer of the wrong question type all read as `null` rather than
 * throwing or returning a half-built value.
 */
const ok = (
  overrides: Partial<Extract<EvaluateOutcome, { ok: true }>> = {},
): EvaluateOutcome => ({
  ok: true,
  model: "typesafe-ai/jev",
  answers: {
    isBug: { type: "boolean", probability: 0.91 },
    area: {
      type: "choice",
      choice: "backend",
      probabilities: { frontend: 0.1, backend: 0.9 },
    },
    severity: { type: "score", score: 2.1, probabilities: { "0": 0.2 } },
    bare: { type: "choice", choice: "frontend" },
  },
  usage: { inputTokens: 120, outputTokens: 0, totalTokens: 120 },
  warnings: [],
  metadata: { typesafe: { confidence: { area: 0.88, severity: 0.4 } } },
  ...overrides,
});

const failed: EvaluateOutcome = {
  ok: false,
  errorCode: "provider_error",
  error: "gateway down",
  retryable: true,
};

describe("readBoolean", () => {
  it("reads P(true) for a boolean answer", () => {
    expect(readBoolean(ok(), "isBug")).toBe(0.91);
  });

  it("is null for a failed outcome, a missing id and a wrong type", () => {
    expect(readBoolean(failed, "isBug")).toBeNull();
    expect(readBoolean(ok(), "nope")).toBeNull();
    expect(readBoolean(ok(), "area")).toBeNull();
  });
});

describe("readChoice", () => {
  it("reads the choice and its probabilities", () => {
    expect(readChoice(ok(), "area")).toEqual({
      choice: "backend",
      probabilities: { frontend: 0.1, backend: 0.9 },
    });
  });

  it("defaults probabilities to an empty map when Jev omits them", () => {
    expect(readChoice(ok(), "bare")).toEqual({
      choice: "frontend",
      probabilities: {},
    });
  });

  it("is null for a failed outcome, a missing id and a wrong type", () => {
    expect(readChoice(failed, "area")).toBeNull();
    expect(readChoice(ok(), "nope")).toBeNull();
    expect(readChoice(ok(), "isBug")).toBeNull();
  });
});

describe("readScore", () => {
  it("reads the position on the scale and its probabilities", () => {
    expect(readScore(ok(), "severity")).toEqual({
      score: 2.1,
      probabilities: { "0": 0.2 },
    });
  });

  it("is null for a failed outcome, a missing id and a wrong type", () => {
    expect(readScore(failed, "severity")).toBeNull();
    expect(readScore(ok(), "nope")).toBeNull();
    expect(readScore(ok(), "isBug")).toBeNull();
  });
});

describe("readConfidence", () => {
  it("reads the per-question confidence out of provider metadata", () => {
    expect(readConfidence(ok(), "area")).toBe(0.88);
  });

  it("is null when the id has no confidence entry", () => {
    expect(readConfidence(ok(), "isBug")).toBeNull();
  });

  it("is null when metadata carries no typesafe block", () => {
    expect(readConfidence(ok({ metadata: { other: 1 } }), "area")).toBeNull();
  });

  it("is null when there is no metadata at all", () => {
    expect(readConfidence(ok({ metadata: null }), "area")).toBeNull();
  });

  it("is null for a failed outcome", () => {
    expect(readConfidence(failed, "area")).toBeNull();
  });
});
