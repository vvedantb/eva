import { describe, expect, it, vi } from "vitest";
import { requestConfirm, shouldSkipConfirm } from "./confirmSkip";

describe("shouldSkipConfirm", () => {
  it("is false when Alt is not held and the event has no altKey", () => {
    expect(shouldSkipConfirm(false)).toBe(false);
    expect(shouldSkipConfirm(false, { altKey: false })).toBe(false);
    expect(shouldSkipConfirm(false, null)).toBe(false);
  });

  it("is true when the store says Alt is held", () => {
    expect(shouldSkipConfirm(true)).toBe(true);
    expect(shouldSkipConfirm(true, { altKey: false })).toBe(true);
  });

  it("is true when the activating event itself has altKey", () => {
    expect(shouldSkipConfirm(false, { altKey: true })).toBe(true);
  });
});

describe("requestConfirm", () => {
  it("opens the dialog when Alt is not held", () => {
    const open = vi.fn();
    const confirm = vi.fn();
    requestConfirm(false, open, confirm);
    expect(open).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("runs the action when Alt is held", () => {
    const open = vi.fn();
    const confirm = vi.fn();
    requestConfirm(true, open, confirm);
    expect(confirm).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it("runs the action when the click carries altKey", () => {
    const open = vi.fn();
    const confirm = vi.fn();
    requestConfirm(false, open, confirm, { altKey: true });
    expect(confirm).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });
});
