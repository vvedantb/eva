import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, mock, test } from "bun:test";
import type { ConvexCallType, JsonObject, JsonValue } from "../types.js";

const WORK_DIR = mkdtempSync(join(tmpdir(), "eva-media-harvest-"));
const realConfig = { ...(await import("../config.js")) };
mock.module("../config.js", () => ({
  ...realConfig,
  WORK_DIR,
  ROOT_DIRECTORY: "",
  RUN_ID: null,
  ENTITY_ID: "s1",
}));

const network: {
  uploads: string[];
  mutations: { path: string; args: JsonObject }[];
} = { uploads: [], mutations: [] };

const realClient = { ...(await import("../http/convexClient.js")) };
mock.module("../http/convexClient.js", () => ({
  ...realClient,
  callConvexWithRetry: async (
    _type: ConvexCallType,
    path: string,
    args: JsonObject,
  ): Promise<JsonValue> => {
    network.mutations.push({ path, args });
    return path === "screenshots:generateUploadUrl"
      ? { value: "https://upload.test" }
      : null;
  },
  fetchWithTimeout: async (
    _url: string,
    options: RequestInit,
  ): Promise<Response> => {
    const body = options.body;
    network.uploads.push(Buffer.isBuffer(body) ? body.toString() : "");
    return Response.json({ storageId: "storage-" + network.uploads.length });
  },
}));

const { uploadAndAttachSandboxMedia } =
  await import("../runtime/completion.js");

afterAll(() => {
  rmSync(WORK_DIR, { recursive: true, force: true });
});

test("posts plain captures once and never follows a link", async () => {
  const shots = join(WORK_DIR, "screenshots");
  const outside = join(WORK_DIR, "outside");
  mkdirSync(shots, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "credentials.png"), "secret-1");
  writeFileSync(join(outside, "env.png"), "secret-2");
  writeFileSync(join(shots, "first.png"), "frame");
  writeFileSync(join(shots, "retry.png"), "frame");
  symlinkSync(join(outside, "credentials.png"), join(shots, "symlink.png"));
  linkSync(join(outside, "env.png"), join(shots, "hardlink.png"));

  await uploadAndAttachSandboxMedia({ turnId: "turn-1" });

  expect(network.uploads).toEqual(["frame"]);
  expect(network.mutations.at(-1)).toEqual({
    path: "screenshots:attachMedia",
    args: {
      parentId: "s1",
      mediaStorageIds: ["storage-1"],
      turnId: "turn-1",
    },
  });
  for (const file of ["first.png", "retry.png"]) {
    expect(existsSync(join(shots, file))).toBe(false);
    expect(existsSync(join(shots, ".posted", file))).toBe(true);
  }
  for (const file of ["symlink.png", "hardlink.png"]) {
    expect(existsSync(join(shots, file))).toBe(true);
    expect(existsSync(join(shots, ".posted", file))).toBe(false);
  }
});
