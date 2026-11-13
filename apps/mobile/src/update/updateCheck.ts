import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { z } from "zod";

/**
 * "A newer APK is out": the app is sideloaded from GitHub Releases
 * (`apps/mobile/RELEASE.md`), with no store and no over-the-air updates, so an
 * old APK keeps calling the backend as it was built. At start the app reads
 * the public releases list once, takes the highest `eva-apk-<version>` tag,
 * and offers it when it is newer than this build. "Later" hides that version
 * until a newer one comes out.
 */

const RELEASES_URL = "https://api.github.com/repos/vvedantb/eva/releases?per_page=30";
const TAG_PREFIX = "eva-apk-";
const DISMISSED_KEY = "eva.updateDismissed";
/** `app.config.ts`'s `DEFAULT_VERSION_NAME`: a local or preview build, which has no release to compare with. */
const UNRELEASED_VERSION = "0.1.0";

const releasesSchema = z.array(
  z.object({
    tag_name: z.string(),
    html_url: z.string(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
  }),
);

export type AvailableUpdate = { version: string; url: string };

/** `[major, minor, patch]` of "1.2.3", or null. */
function parseVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Positive when `a` is newer than `b`. */
function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The newest published APK newer than `current`, or null. The download is the APK itself, else its release page. */
export function newerRelease(releases: z.infer<typeof releasesSchema>, current: string): AvailableUpdate | null {
  const installed = parseVersion(current);
  if (!installed) return null;
  let best: { parts: [number, number, number]; update: AvailableUpdate } | null = null;
  for (const release of releases) {
    if (release.draft || release.prerelease || !release.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = release.tag_name.slice(TAG_PREFIX.length);
    const parts = parseVersion(version);
    if (!parts || compareVersions(parts, installed) <= 0) continue;
    if (best && compareVersions(parts, best.parts) <= 0) continue;
    const apk = release.assets.find((asset) => asset.name.endsWith(".apk"));
    best = { parts, update: { version, url: apk?.browser_download_url ?? release.html_url } };
  }
  return best?.update ?? null;
}

let available: AvailableUpdate | null = null;
const listeners = new Set<() => void>();

function publish(next: AvailableUpdate | null) {
  available = next;
  for (const listener of listeners) listener();
}

/** Looks for a newer APK once at start. Offline, rate limited or a local build: nothing is offered. */
export async function checkForUpdate() {
  const current = Constants.expoConfig?.version;
  if (!current || current === UNRELEASED_VERSION) return;
  try {
    const response = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return;
    const parsed = releasesSchema.safeParse(await response.json());
    if (!parsed.success) return;
    const update = newerRelease(parsed.data, current);
    if (!update) return;
    const dismissed = await SecureStore.getItemAsync(DISMISSED_KEY).catch(() => null);
    if (dismissed !== update.version) publish(update);
  } catch {
    // A failed check must never get in the way of the app.
  }
}

/** Closes the prompt for this run only: after Download, it asks again next launch if the APK was not installed. */
export function closeUpdatePrompt() {
  publish(null);
}

/** Hides this version's prompt until a newer one is out. */
export function dismissUpdate() {
  const version = available?.version;
  publish(null);
  if (version) SecureStore.setItemAsync(DISMISSED_KEY, version).catch(() => undefined);
}

/** The newer APK to offer, or null. */
export function useAvailableUpdate(): AvailableUpdate | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => available,
  );
}
