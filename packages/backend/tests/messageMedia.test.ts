import { describe, expect, test } from "bun:test";
import {
  appendMediaStorageIds,
  incomingMediaStorageIds,
  messageMediaStorageIds,
  messageNeedsUrlResolution,
} from "../convex/_messages/media";

const video = "video-1";
const image = "image-1";

describe("appendMediaStorageIds", () => {
  test("appends to what the message already holds", () => {
    expect(
      appendMediaStorageIds([video], { mediaStorageIds: [image] }),
    ).toEqual([video, image]);
  });

  test("keeps existing ids first", () => {
    const second = "video-2";
    expect(
      appendMediaStorageIds([video, image], { mediaStorageIds: [second] }),
    ).toEqual([video, image, second]);
  });

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
