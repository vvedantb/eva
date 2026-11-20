import { describe, expect, test } from "bun:test";
import { parseScreenshotInbound } from "./previewScreenshot";

describe("preview screenshot protocol", () => {
  test("accepts a png data url and rejects anything else", () => {
    expect(
      parseScreenshotInbound({
        type: "eva-preview-screenshot",
        requestId: "r1",
        dataUrl: "data:image/png;base64,abc",
      }),
    ).toEqual({
      type: "screenshot",
      requestId: "r1",
      dataUrl: "data:image/png;base64,abc",
    });
    expect(
      parseScreenshotInbound({
        type: "eva-preview-screenshot",
        requestId: "r1",
        dataUrl: "https://evil.example/x.png",
      }),
    ).toBeNull();
  });

  test("accepts a failed capture", () => {
    expect(
      parseScreenshotInbound({
        type: "eva-preview-screenshot-error",
        requestId: "r2",
        message: "Couldn't render this page as an image",
      }),
    ).toEqual({
      type: "error",
      requestId: "r2",
      message: "Couldn't render this page as an image",
    });
  });
});
