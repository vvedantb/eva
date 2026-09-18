import { expect, test } from "vitest";
import {
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
