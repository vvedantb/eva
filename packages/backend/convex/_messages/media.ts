type MediaFields<TId> = {
  imageStorageId?: TId;
  videoStorageId?: TId;
  mediaStorageIds?: TId[];
};

/**
 * The ids one `updateLastInternal` call contributes, in capture order.
 *
 * Video before image, matching the order the legacy pair was resolved in.
 */
export function incomingMediaStorageIds<TId>(args: MediaFields<TId>): TId[] {
  return [
    ...(args.mediaStorageIds ?? []),
    ...(args.videoStorageId ? [args.videoStorageId] : []),
    ...(args.imageStorageId ? [args.imageStorageId] : []),
  ];
}

/**
 * The message's media ids after appending one call's worth.
 *
 * Appends rather than replaces: a turn that captures twice used to keep only the
 * last upload and orphan the earlier blob in storage. Returns `undefined` when
 * the call carries no media, so the caller leaves the field untouched instead of
 * writing an empty array over what is already there.
 */
export function appendMediaStorageIds<TId>(
  existing: TId[] | undefined,
  args: MediaFields<TId>,
): TId[] | undefined {
  const incoming = incomingMediaStorageIds(args);
  if (incoming.length === 0) return undefined;
  return [...(existing ?? []), ...incoming];
}

/**
 * The ids to resolve to URLs for a stored message.
 *
 * `mediaStorageIds` is the source of truth once a doc has it — including when it
 * is empty, which means the media was removed. Only a doc that predates the
 * field falls back to the legacy pair.
 */
export function messageMediaStorageIds<TId>(doc: MediaFields<TId>): TId[] {
  if (doc.mediaStorageIds !== undefined) return doc.mediaStorageIds;
  return [doc.videoStorageId, doc.imageStorageId].filter(
    (id): id is TId => id !== undefined,
  );
}

/**
 * True when `listByParent` must hit Convex storage for this row.
 *
 * Text-only messages are the common case; resolving URLs for them was a
 * `Promise.all` over every doc on every chat subscription.
 */
export function messageNeedsUrlResolution<TId>(
  doc: MediaFields<TId> & { attachmentStorageIds?: TId[] },
): boolean {
  return (
    (doc.attachmentStorageIds?.length ?? 0) > 0 ||
    messageMediaStorageIds(doc).length > 0
  );
}
