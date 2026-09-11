import { expect, test } from "vitest";
import {
  resolveStorageEntries,
  resolveStorageUrls,
} from "../convex/_chat/storageUrls";

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

test("resolveStorageEntries keeps order and null urls", async () => {
  const urls = new Map<string, string | null>([
    ["a", "https://cdn.example/a"],
    ["b", null],
  ]);
  const types = new Map<string, string>([
    ["a", "image/png"],
    ["b", "text/plain"],
  ]);
  const result = await resolveStorageEntries(
    (id: string) => Promise.resolve(urls.get(id) ?? null),
    (id: string) => Promise.resolve({ contentType: types.get(id) }),
    ["a", "b"],
  );
  expect(result).toEqual([
    { id: "a", url: "https://cdn.example/a", contentType: "image/png" },
    { id: "b", url: null, contentType: "text/plain" },
  ]);
});
