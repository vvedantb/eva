/**
 * Turns Convex storage IDs into public URLs, dropping IDs that no longer
 * resolve. Claim handlers share this so a missing attachment does not
 * fail the whole turn.
 */
export async function resolveStorageUrls<T>(
  getUrl: (id: T) => Promise<string | null>,
  storageIds: T[] | undefined,
): Promise<string[]> {
  if (storageIds === undefined || storageIds.length === 0) return [];
  const resolved = await Promise.all(storageIds.map((id) => getUrl(id)));
  const urls: string[] = [];
  for (const url of resolved) {
    if (url !== null) urls.push(url);
  }
  return urls;
}

export type StorageEntry<T> = {
  id: T;
  url: string | null;
  contentType: string | null;
};

/**
 * Resolves URL + content type for each storage id. Callers decide whether
 * a missing blob is dropped or kept as a null url.
 */
export async function resolveStorageEntries<T>(
  getUrl: (id: T) => Promise<string | null>,
  getMetadata: (
    id: T,
  ) => Promise<{ contentType?: string | null } | null>,
  storageIds: T[] | undefined,
): Promise<Array<StorageEntry<T>>> {
  if (storageIds === undefined || storageIds.length === 0) return [];
  return Promise.all(
    storageIds.map(async (id) => {
      const [url, meta] = await Promise.all([getUrl(id), getMetadata(id)]);
      return { id, url, contentType: meta?.contentType ?? null };
    }),
  );
}
