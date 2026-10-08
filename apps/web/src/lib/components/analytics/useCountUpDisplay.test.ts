import { describe, expect, it } from "vitest";
import { parseCountable } from "./useCountUpDisplay";

describe("parseCountable", () => {
  it("keeps bare numbers", () => {
    expect(parseCountable(42)).toEqual({
      amount: 42,
      prefix: "",
      suffix: "",
      decimals: 0,
    });
  });

  it("keeps a trailing percent or hour", () => {
    expect(parseCountable("45%")).toMatchObject({ amount: 45, suffix: "%" });
    expect(parseCountable("12h")).toMatchObject({ amount: 12, suffix: "h" });
  });

  it("leaves compound durations and em-dashes alone", () => {
    expect(parseCountable("1h 12m")).toBeNull();
    expect(parseCountable("—")).toBeNull();
  });
});
