import { expect, test } from "vitest";
import {
  customerConvexOrigin,
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
  expect(customerConvexOrigin("https://happy-animal-123.convex.cloud/")).toBe(
    "https://happy-animal-123.convex.cloud",
  );
  expect(
    customerConvexOrigin("https://happy-animal-123.eu-west-1.convex.cloud"),
  ).toBe("https://happy-animal-123.eu-west-1.convex.cloud");
  for (const url of [
    "not a url",
    "https://evil.example",
    "https://convex.cloud.evil.example",
    "https://evilconvex.cloud",
    "http://happy-animal-123.convex.cloud",
    "https://user:key@happy-animal-123.convex.cloud",
    "https://happy-animal-123.convex.cloud@evil.example",
    "https://169.254.169.254",
    "http://127.0.0.1:3210",
  ]) {
    expect(() => customerConvexOrigin(url), url).toThrow(/Convex URL/);
  }
});
