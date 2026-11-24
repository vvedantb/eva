import { expect, test } from "bun:test";
import {
  mediaCandidateRoots,
  mediaSearchDirs,
} from "../callback-src/runtime/sandboxMedia";

test("mediaCandidateRoots includes app rootDirectory", () => {
  expect(mediaCandidateRoots("/tmp/repo", "apps/web")).toEqual([
    "/tmp/repo",
    "/tmp/repo/apps/web",
  ]);
});

test("mediaCandidateRoots ignores empty or unsafe rootDirectory", () => {
  expect(mediaCandidateRoots("/tmp/repo", "")).toEqual(["/tmp/repo"]);
  expect(mediaCandidateRoots("/tmp/repo", ".")).toEqual(["/tmp/repo"]);
  expect(mediaCandidateRoots("/tmp/repo", "../escape")).toEqual(["/tmp/repo"]);
  expect(mediaCandidateRoots("/tmp/repo", "/abs")).toEqual(["/tmp/repo"]);
});

test("mediaSearchDirs lists recordings and screenshots under each root", () => {
  expect(mediaSearchDirs("/tmp/repo", "apps/web")).toEqual({
    recordings: ["/tmp/repo/recordings", "/tmp/repo/apps/web/recordings"],
    screenshots: ["/tmp/repo/screenshots", "/tmp/repo/apps/web/screenshots"],
  });
});
