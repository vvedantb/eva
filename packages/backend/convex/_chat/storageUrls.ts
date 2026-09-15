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
