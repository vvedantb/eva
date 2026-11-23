import {
  existsSync,
  linkSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test, vi } from "vitest";
import type * as Config from "../config.js";
import { WORK_DIR } from "../config.js";
import type * as ConvexClient from "../http/convexClient.js";
import { uploadAndAttachSandboxMedia } from "../runtime/completion.js";
import type { ConvexCallType, JsonObject, JsonValue } from "../types.js";

// The harvest scans `<WORK_DIR>/screenshots`; point it at a scratch checkout.
vi.mock("../config.js", async (importOriginal) => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  return {
    ...(await importOriginal<typeof Config>()),
    WORK_DIR: mkdtempSync(path.join(tmpdir(), "eva-media-harvest-")),
    ROOT_DIRECTORY: "",
    RUN_ID: null,
    ENTITY_ID: "s1",
  };
});

const network = vi.hoisted(() => {
  const uploads: string[] = [];
  const mutations: { path: string; args: JsonObject }[] = [];
  return { uploads, mutations };
});

// Only the network is faked: the upload URL, the upload POST, the attach.
vi.mock("../http/convexClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexClient>()),
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

afterAll(() => {
  rmSync(WORK_DIR, { recursive: true, force: true });
});

/**
 * The agent (or a prompt injection) controls the screenshots folder. A link
 * there must not post a secret file to chat; a plain capture posts once and is
 * archived so the next turn does not post it again.
 */
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

  // Byte-identical captures upload once.
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
