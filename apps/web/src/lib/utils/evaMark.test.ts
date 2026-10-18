import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { evaMarkDataUri } from "./evaMark";

const here = dirname(fileURLToPath(import.meta.url));
const staticFavicon = readFileSync(
  join(here, "../../../public/favicon.svg"),
  "utf8",
);

function runtimeSvg(badgeLabel: string | null): string {
  const uri = evaMarkDataUri("dark", badgeLabel, "#FF0000", "#FFFFFF");
  return decodeURIComponent(uri.replace("data:image/svg+xml,", ""));
}

/** Geometry that must match between the runtime favicon and `favicon.svg`. */
function markGeometry(svg: string) {
  return {
    circles: [...svg.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"/g)].map(
      (match) => match.slice(1, 4).join(","),
    ),
    transform: svg.match(/transform="([^"]+)"/)?.[1],
    polygons: [...svg.matchAll(/points="([^"]+)"/g)].map((match) => match[1]),
  };
}

/**
 * Regression: the favicon disc was inset and off-centre (210/210/r210), so its
 * edge missed the pixel grid and the tab icon looked blurry and jagged.
 */
test("runtime favicon disc fills the whole 512 canvas", () => {
  expect(markGeometry(runtimeSvg(null)).circles).toEqual([
    "256,256,256",
    "256,256,256",
  ]);
});

/**
 * `public/favicon.svg` is a hand-written copy of the runtime mark. The tab
 * shows it before JS runs, so drift makes the icon jump on load.
 */
test("static favicon.svg mirrors the runtime favicon geometry", () => {
  expect(markGeometry(staticFavicon)).toEqual(markGeometry(runtimeSvg(null)));
});

/** The badge draws on top; it must not move or resize the mark under it. */
test("unread badge leaves the mark geometry unchanged", () => {
  const plain = markGeometry(runtimeSvg(null));
  const badged = markGeometry(runtimeSvg("3"));
  expect(badged.transform).toBe(plain.transform);
  expect(badged.polygons).toEqual(plain.polygons);
  expect(badged.circles.slice(0, 2)).toEqual(plain.circles);
});
