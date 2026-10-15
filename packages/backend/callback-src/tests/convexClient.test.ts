import { describe, expect, it } from "vitest";
import {
  HttpResponseError,
  shouldRetryHttpError,
} from "../http/convexClient.js";

describe("signed callback retries", () => {
  it("does not retry deterministic client failures", () => {
    expect(
      shouldRetryHttpError(new HttpResponseError("catalog", 400, "bad")),
    ).toBe(false);
    expect(
      shouldRetryHttpError(new HttpResponseError("catalog", 401, "no")),
    ).toBe(false);
  });

  it("retries network failures and server failures", () => {
    expect(shouldRetryHttpError(new Error("socket closed"))).toBe(true);
    expect(
      shouldRetryHttpError(new HttpResponseError("catalog", 503, "later")),
    ).toBe(true);
  });
});
