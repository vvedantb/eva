import { expect, test } from "vitest";
import { resolveStorageUrls } from "../convex/_chat/storageUrls";

test("resolveStorageUrls drops missing blobs and keeps order", async () => {
  const urls = new Map<string, string | null>([
    ["a", "https://cdn.example/a"],
    ["b", null],
    ["c", "https://cdn.example/c"],
  ]);
  const result = await resolveStorageUrls(
    (id: string) => Promise.resolve(urls.get(id) ?? null),
    ["a", "b", "c"],
  );
  expect(result).toEqual(["https://cdn.example/a", "https://cdn.example/c"]);
});

test("resolveStorageUrls treats missing lists as empty", async () => {
  expect(await resolveStorageUrls(async () => "x", undefined)).toEqual([]);
  expect(await resolveStorageUrls(async () => "x", [])).toEqual([]);
});
