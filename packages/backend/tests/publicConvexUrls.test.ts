import { expect, test } from "vitest";
import {
  assertAllowedCustomerConvexUrl,
  assertSafeConvexFetchUrl,
  resolvePublicConvexCloudUrl,
  resolvePublicConvexSiteUrl,
} from "../convex/_env/publicConvexUrls";

test("public cloud URL prefers the EVA_ tunnel override", () => {
  expect(
    resolvePublicConvexCloudUrl({
      EVA_PUBLIC_CONVEX_URL: "https://tunneled.example",
      CONVEX_CLOUD_URL: "https://x.convex.cloud",
    }),
  ).toBe("https://tunneled.example");
});

test("public site URL prefers an explicit site override, then rewrites cloud", () => {
  expect(
    resolvePublicConvexSiteUrl({
      EVA_PUBLIC_CONVEX_SITE_URL: "https://site.example",
      CONVEX_SITE_URL: "https://x.convex.site",
      CONVEX_CLOUD_URL: "https://x.convex.cloud",
    }),
  ).toBe("https://site.example");
  expect(
    resolvePublicConvexSiteUrl({
      CONVEX_CLOUD_URL: "https://x.convex.cloud",
    }),
      ).toBe("https://x.convex.site");
});

test("customer Convex URLs must be https Convex Cloud hosts", () => {
  expect(assertAllowedCustomerConvexUrl("https://happy-animal-123.convex.cloud")).toBe(
    "https://happy-animal-123.convex.cloud",
  );
  expect(assertAllowedCustomerConvexUrl("https://happy-animal-123.convex.cloud/")).toBe(
    "https://happy-animal-123.convex.cloud",
  );
  expect(() =>
    assertAllowedCustomerConvexUrl("https://evil.example/steal"),
  ).toThrow(/not allowed/);
  expect(() =>
    assertAllowedCustomerConvexUrl("http://happy-animal-123.convex.cloud"),
  ).toThrow(/https/);
  expect(() =>
    assertAllowedCustomerConvexUrl(
      "https://user:deploykey@happy-animal-123.convex.cloud",
    ),
  ).toThrow(/credentials/);
  expect(() =>
    assertAllowedCustomerConvexUrl("https://169.254.169.254"),
  ).toThrow(/not allowed/);
});

test("test-query fetch allows Eva's own URL and rejects others", () => {
  expect(
    assertSafeConvexFetchUrl(
      "https://tunneled.example/",
      "https://tunneled.example",
    ),
  ).toBe("https://tunneled.example");
  expect(
    assertSafeConvexFetchUrl(
      "https://happy-animal-123.convex.cloud",
      "https://eva.convex.cloud",
    ),
  ).toBe("https://happy-animal-123.convex.cloud");
  expect(() =>
    assertSafeConvexFetchUrl("https://evil.example", "https://eva.convex.cloud"),
  ).toThrow(/not allowed/);
});
