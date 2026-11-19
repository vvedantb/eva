import { describe, expect, it } from "vitest";
import { countLinkUrls } from "./linkUrls";

describe("countLinkUrls", () => {
  it("counts every supported link in free prose", () => {
    const text =
      "See https://linear.app/evalucom/issue/DEV-1, " +
      "https://www.figma.com/design/KEY, https://evalucom.sentry.io/issues/1, " +
      "https://eu.posthog.com/project/1 and " +
      "https://github.com/evalucom/repo/pull/2, ignore https://example.com";
    expect(countLinkUrls(text)).toBe(5);
  });
});
