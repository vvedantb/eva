import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), "utf8");

const provider = read("AveLauncherProvider.tsx");
/**
 * The provider owns open/closed state; `AveLauncherSurface` owns where the
 * launcher sits and mounts the two surfaces, so it is what imports them.
 */
const surface = read("AveLauncherSurface.tsx");
const panel = read("AvePanel.tsx");
const button = read("AveLauncherButton.tsx");

/**
 * Regression: the whole popover used to be one lazy chunk, so the first click
 * waited on the session tree (chat, mentions, markdown) before anything
 * rendered — the origin-aware spring never played, it just appeared.
 *
 * The split moved down a level: chrome is eager so the spring runs on click,
 * and only `AvePanelBody` is lazy. Re-wrapping `AvePanel` in `lazy` would put
 * the delay back with nothing failing, so pin the boundary here.
 */
test("the popover chrome is eager and only the body is lazy", () => {
  expect(surface).toMatch(
    /import \{ AvePanel \} from "@\/lib\/components\/ave\/AvePanel"/,
  );
  for (const source of [provider, surface]) {
    expect(source).not.toContain("lazy(");
    expect(source).not.toContain("Suspense");
  }

  expect(panel).toMatch(/lazy\(\s*\(\) =>\s*import\([^)]*AvePanelBody/);
  expect(panel).toContain("Suspense");
});

/** Hover/focus starts the body chunk so the first click rarely waits at all. */
test("the launcher preloads the body on intent", () => {
  expect(surface).toMatch(/import\([^)]*AvePanelBody/);
  expect(surface).toContain("onIntent={preloadAvePanelBody}");

  expect(button).toContain("onMouseEnter={onIntent}");
  expect(button).toContain("onFocus={onIntent}");
});

/**
 * The assertions above read `AveLauncherSurface`, so a provider that stopped
 * rendering it would leave them passing against a file nothing mounts.
 */
test("the provider mounts the launcher surface", () => {
  expect(provider).toMatch(
    /import \{ AveLauncherSurface \} from "@\/lib\/components\/ave\/AveLauncherSurface"/,
  );
  expect(provider).toContain("<AveLauncherSurface");
});
