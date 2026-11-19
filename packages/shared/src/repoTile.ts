/**
 * The colour of a repo's initial tile (a logo-less repo's first letter), as
 * one of the eight `--cat-*` slots: the web rail, composer switcher and chat
 * header (`repoTileColor`), and the phone chat header (`EVA_THEME.cat1` …).
 */
export type RepoTileSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// The tile's original 8-colour palette, in its original hash-bucket order:
// blue, emerald, amber, rose, purple, lime, indigo, orange. Each bucket maps
// onto the nearest `cat-*` slot so every repo keeps the colour family it
// already had. The mapping is injective, so tiles stay as distinguishable.
const SLOT_BY_BUCKET: Record<number, RepoTileSlot> = {
  0: 1, // blue -> blue
  1: 6, // emerald -> emerald
  2: 4, // amber -> amber
  3: 5, // rose -> rose
  4: 2, // purple -> violet
  5: 3, // lime -> teal (nearest remaining hue)
  6: 7, // indigo -> sky
  7: 8, // orange -> orange
};

/**
 * The repo's tile slot. Seed with `${owner}/${name}/${repoDisplayLabel(repo)}`
 * so every surface picks the same colour. Keeps the tile's original additive
 * hash (not `catSlotForId`), so existing repos do not change colour.
 */
export function repoTileSlot(seed: string): RepoTileSlot {
  let bucket = 0;
  for (let i = 0; i < seed.length; i++) {
    bucket = (bucket + seed.charCodeAt(i)) % 8;
  }
  return SLOT_BY_BUCKET[bucket] ?? 1;
}

/** The leaf directory name used as a monorepo app's URL and display label. */
export function appLeafName(app: { name: string; rootDirectory?: string }): string {
  return app.rootDirectory?.split("/").pop() ?? app.name;
}

/** Custom `label` when set; otherwise the GitHub name or the monorepo leaf. */
export function repoDisplayLabel(repo: { label?: string; name: string; rootDirectory?: string }): string {
  const custom = repo.label?.trim();
  if (custom) return custom;
  return appLeafName(repo);
}
