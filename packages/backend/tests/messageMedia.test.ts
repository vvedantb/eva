import { describe, expect, test } from "bun:test";
import {
  appendMediaStorageIds,
  incomingMediaStorageIds,
  messageMediaStorageIds,
  messageNeedsUrlResolution,
} from "../convex/_messages/media";

// The helpers are generic over the id type, so plain strings stand in for the
// `Id<"_storage">` the Convex call sites pass.
const video = "video-1";
const image = "image-1";

/**
 * A turn that captured twice used to keep only the last upload, leaving the
 * earlier recording orphaned in storage and invisible in the chat (fix cf7a3cba).
 * Accumulation is the whole fix, so every rule around it is pinned here.
 */
describe("appendMediaStorageIds", () => {
  test("appends to what the message already holds", () => {
    expect(
      appendMediaStorageIds([video], { mediaStorageIds: [image] }),
    ).toEqual([video, image]);
  });

  /** Capture order is the render order, so appends go on the end. */
  test("keeps existing ids first", () => {
    const second = "video-2";
    expect(
      appendMediaStorageIds([video, image], { mediaStorageIds: [second] }),
    ).toEqual([video, image, second]);
  });

  /**
   * `undefined`, not `[]`. A content-only streaming update calls this on every
   * chunk; writing an empty array would wipe the media the turn already captured.
   */
  test("returns undefined when the call carries no media", () => {
    expect(appendMediaStorageIds([video], {})).toBeUndefined();
    expect(appendMediaStorageIds(undefined, {})).toBeUndefined();
    expect(
      appendMediaStorageIds([video], { mediaStorageIds: [] }),
    ).toBeUndefined();
  });

  test("starts a fresh list when the message has none", () => {
    expect(appendMediaStorageIds(undefined, { videoStorageId: video })).toEqual(
      [video],
    );
  });

  /** Legacy callers are stale callback bundles still in flight during a deploy. */
  test("accepts legacy single-media args alongside the array", () => {
    const extra = "image-2";
    expect(
      appendMediaStorageIds([], {
        mediaStorageIds: [video],
        imageStorageId: extra,
      }),
    ).toEqual([video, extra]);
  });
});

describe("incomingMediaStorageIds", () => {
  /** Video first, matching the order the legacy pair was resolved in. */
  test("orders video before image", () => {
    expect(
      incomingMediaStorageIds({ imageStorageId: image, videoStorageId: video }),
    ).toEqual([video, image]);
  });

  test("drops the absent half of the legacy pair", () => {
    expect(incomingMediaStorageIds({ imageStorageId: image })).toEqual([image]);
  });
});

describe("messageMediaStorageIds", () => {
  test("reads the array when the doc has one", () => {
    expect(
      messageMediaStorageIds({
        mediaStorageIds: [video],
        imageStorageId: image,
      }),
    ).toEqual([video]);
  });

  /**
   * An empty array is a real state — media removed — not a missing field. Falling
   * back here would resurrect a legacy id the doc has already moved past.
   */
  test("treats an empty array as authoritative", () => {
    expect(
      messageMediaStorageIds({
        mediaStorageIds: [],
        videoStorageId: video,
      }),
    ).toEqual([]);
  });

  test("falls back to the legacy pair on pre-migration docs", () => {
    expect(
      messageMediaStorageIds({ videoStorageId: video, imageStorageId: image }),
    ).toEqual([video, image]);
  });

  test("returns nothing for a message with no media at all", () => {
    expect(messageMediaStorageIds({})).toEqual([]);
  });
});

describe("messageNeedsUrlResolution", () => {
  test("skips text-only messages", () => {
    expect(messageNeedsUrlResolution({})).toBe(false);
    expect(messageNeedsUrlResolution({ attachmentStorageIds: [] })).toBe(
      false,
    );
    expect(messageNeedsUrlResolution({ mediaStorageIds: [] })).toBe(false);
  });

  test("hits storage for attachments or agent media", () => {
    expect(
      messageNeedsUrlResolution({ attachmentStorageIds: ["file-1"] }),
    ).toBe(true);
    expect(messageNeedsUrlResolution({ mediaStorageIds: [video] })).toBe(true);
    expect(messageNeedsUrlResolution({ videoStorageId: video })).toBe(true);
  });
});
