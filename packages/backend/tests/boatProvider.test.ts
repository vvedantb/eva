import { afterEach, describe, expect, test, vi } from "vitest";
import {
  boatTemplateStatus,
  createBoatClient,
  labelsFromName,
  labelsToName,
  normalizeBoatState,
} from "../convex/_sandbox/boatProvider";
import {
  isBoatSandboxId,
  isUsableSnapshotRef,
  providerForId,
} from "../convex/_sandbox/boatApi";
import { getSandboxClient } from "../convex/_sandbox/factory";
import { SandboxProviderError } from "../convex/_sandbox/provider";
import { selectBoatApiKey } from "../convex/_envVars/boatCredentials";

/**
 * The Boat adapter against a fake Boat API: each test scripts the responses a
 * real account returned during the 2026-09 spike (shapes copied from
 * docs.boat.dev/api/v1), and asserts on the requests the adapter sends.
 */

type Call = { method: string; path: string; body: unknown; headers: Headers };

const ID = "bx_abcdefgh";
const sandbox = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  name: "eva",
  state: "idle",
  archiveAfter: new Date(Date.now() + 3_600_000).toISOString(),
  ...overrides,
});

/** Installs a fake `fetch` that answers from `route` and records every call. */
function fakeBoat(route: (call: Call) => unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      const call: Call = {
        method: init.method ?? "GET",
        path: url.pathname.replace("/api/v1", "") + url.search,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
        headers: new Headers(init.headers),
      };
      calls.push(call);
      const reply = route(call);
      const status =
        reply !== null && typeof reply === "object" && "status" in reply
          ? Number(reply.status)
          : 200;
      return new Response(JSON.stringify(reply), { status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ids and routing", () => {
  test("Boat ids are recognised; Vercel names and snap_ ids are not", () => {
    expect(isBoatSandboxId("bx_23456789")).toBe(true);
    expect(isBoatSandboxId("white-spiritual-cobra-vvQSfA")).toBe(false);
    expect(isBoatSandboxId("snap_abc")).toBe(false);
    expect(providerForId("bx_23456789")).toBe("boat");
    expect(providerForId("snap_abc")).toBe("vercel");
  });

  test("a provider only boots its own captures", () => {
    expect(isUsableSnapshotRef("bx_23456789", "boat")).toBe(true);
    expect(isUsableSnapshotRef("snap_abc", "boat")).toBe(false);
    expect(isUsableSnapshotRef("snap_abc", "vercel")).toBe(true);
    expect(isUsableSnapshotRef("bx_23456789", "vercel")).toBe(false);
  });

  test("routing client reaches a Boat sandbox by id even when Vercel is preferred", async () => {
    const calls = fakeBoat(() => ({ ok: true, sandbox: sandbox() }));
    const client = getSandboxClient({
      preferred: "vercel",
      vercel: { token: "t", teamId: "team", projectId: "prj" },
      boat: { apiKey: "boat_key" },
    });
    expect(client.kind).toBe("vercel");
    const handle = await client.get(ID);
    expect(handle.id).toBe(ID);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer boat_key");
  });

  test("missing Boat credentials name the variable instead of guessing a provider", async () => {
    const client = getSandboxClient({
      preferred: "vercel",
      vercel: { token: "t", teamId: "team", projectId: "prj" },
    });
    await expect(client.get(ID)).rejects.toThrow(/BOAT_API_KEY/);
  });
});

describe("state mapping", () => {
  test("mid-stop never reads as idle-stopped", () => {
    expect(normalizeBoatState("archiving")).toBe("starting");
    expect(normalizeBoatState("archived")).toBe("stopped");
    expect(normalizeBoatState("idle")).toBe("running");
    expect(normalizeBoatState("ready")).toBe("running");
    expect(normalizeBoatState("error")).toBe("error");
  });

  test("a template is ready only once archived with a snapshot", () => {
    expect(boatTemplateStatus(sandbox({ state: "archiving" }))).toBe("pending");
    expect(
      boatTemplateStatus(
        sandbox({ state: "archived", snapshotAvailable: true }),
      ),
    ).toBe("ready");
    expect(
      boatTemplateStatus(
        sandbox({ state: "archived", lastSnapshotStatus: "failed" }),
      ),
    ).toBe("error");
  });

  test("labels survive the round trip through a sandbox name", () => {
    const labels = { "eva.purpose": "snapshot-seed-prep", "eva.repoId": "k9" };
    expect(labelsFromName(labelsToName(labels))).toEqual(labels);
    expect(labelsFromName("Box 2026-09-26 16:01")).toEqual({});
  });
});

describe("handle", () => {
  test("exec wraps the command, sources the env file and always sends a timeout", async () => {
    const calls = fakeBoat((call) =>
      call.method === "POST"
        ? { ok: true, exitCode: 3, stdout: "out\n", stderr: "err\n" }
        : { ok: true, sandbox: sandbox() },
    );
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    const result = await handle.exec("echo hi", { cwd: "/tmp/repo" });
    expect(result).toEqual({ exitCode: 3, output: "out\nerr\n" });
    const body = calls[1]?.body;
    expect(body).toMatchObject({ timeoutSeconds: 600 });
    expect(JSON.stringify(body)).toContain("/vercel/sandbox/.eva-env.sh");
    expect(JSON.stringify(body)).toMatch(/cd .*\/tmp\/repo.* && echo hi/);
  });

  test("a killed command reports a non-zero exit like Vercel", async () => {
    fakeBoat((call) =>
      call.method === "POST"
        ? { ok: true, exitCode: null, timedOut: true, stdout: "", stderr: "" }
        : { ok: true, sandbox: sandbox() },
    );
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    expect(
      (await handle.exec("sleep 99", { timeoutSeconds: 1 })).exitCode,
    ).toBe(124);
  });

  test("files outside /tmp and /home/user are staged, then moved", async () => {
    const calls = fakeBoat((call) =>
      call.method === "POST"
        ? { ok: true, exitCode: 0, stdout: "", stderr: "" }
        : call.method === "PUT"
          ? { ok: true }
          : { ok: true, sandbox: sandbox() },
    );
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    await handle.writeFile("/vercel/sandbox/.eva-env.sh", "export A=1\n");
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.stringify(put?.body)).toMatch(/"path":"\/tmp\/\.eva-upload-/);
    const move = calls.find((c) => c.method === "POST");
    expect(JSON.stringify(move?.body)).toContain("/vercel/sandbox/.eva-env.sh");

    calls.length = 0;
    await handle.writeFile("/tmp/run-design.mjs", new Uint8Array([1, 2, 3]));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({
      path: "/tmp/run-design.mjs",
      encoding: "base64",
      content: "AQID",
    });
  });

  test("preview URLs are public so Eva's own grant is the only gate", async () => {
    const calls = fakeBoat((call) =>
      call.path.endsWith("/host")
        ? { ok: true, url: "https://box-node-1-3000.on.boat.dev" }
        : { ok: true, sandbox: sandbox() },
    );
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    const preview = await handle.previewUrl(3000);
    expect(preview.url).toBe("https://box-node-1-3000.on.boat.dev");
    expect(calls[1]?.body).toEqual({ port: 3000, public: true });
  });

  test("deleting a template keeps it when its own id is preserved", async () => {
    const calls = fakeBoat(() => ({ ok: true, sandbox: sandbox() }));
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    await handle.delete({ preserveSnapshotIds: [ID] });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await handle.delete();
    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.headers.get("x-ascii-confirm-delete")).toBe(ID);
  });

  test("extendTimeout only patches once the deadline is inside the window", async () => {
    const calls = fakeBoat(() => ({ ok: true, sandbox: sandbox() }));
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    await handle.extendTimeout(60_000);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await handle.extendTimeout(7_200_000);
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
      ttlSeconds: 7200,
    });
  });

  test("a 404 surfaces as a provider error with the status, so it classifies as gone", async () => {
    fakeBoat(() => ({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Sandbox not found",
    }));
    const error = await createBoatClient({ apiKey: "k" })
      .get(ID)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxProviderError);
    expect(error instanceof SandboxProviderError && error.httpStatus).toBe(404);
  });

  test("createSnapshot renames the sandbox out of seed-prep sweeps, stops it and returns its own id", async () => {
    const calls = fakeBoat(() => ({ ok: true, sandbox: sandbox() }));
    const handle = await createBoatClient({ apiKey: "k" }).get(ID);
    const { snapshotId } = await handle.createSnapshot({ name: "seeded-k9" });
    expect(snapshotId).toBe(ID);
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      body: { name: "eva template=seeded-k9" },
    });
    expect(calls[2]?.path).toBe(`/sandboxes/${ID}/stop`);
  });
});

describe("create", () => {
  test("a Vercel snapshot on a Boat repo boots fresh instead of failing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = fakeBoat((call) =>
      call.path.endsWith("/commands")
        ? { ok: true, exitCode: 0, stdout: "", stderr: "" }
        : { ok: true, sandbox: sandbox() },
    );
    const handle = await createBoatClient({ apiKey: "k" }).create({
      snapshot: "snap_old",
      envVars: {},
      lifecycle: { autoStopMinutes: 10, labels: { "eva.repoId": "k9" } },
    });
    vi.useRealTimers();
    expect(handle.id).toBe(ID);
    const create = calls[0];
    expect(create?.path).toBe("/sandboxes");
    expect(create?.body).toMatchObject({
      type: "large",
      noEnv: true,
      ttlSeconds: 24 * 60 * 60,
    });
    expect(create?.headers.get("idempotency-key")).toBeTruthy();
    expect(
      calls.some((c) =>
        JSON.stringify(c.body ?? {}).includes("link /vercel/sandbox"),
      ),
    ).toBe(true);
  });

  test("a Boat template is forked", async () => {
    const calls = fakeBoat((call) =>
      call.path.endsWith("/commands")
        ? { ok: true, exitCode: 0, stdout: "", stderr: "" }
        : { ok: true, sandbox: sandbox({ id: "bx_forked22" }) },
    );
    await createBoatClient({ apiKey: "k" }).create({
      snapshot: ID,
      envVars: {},
      lifecycle: { autoStopMinutes: 24 * 60 },
    });
    expect(calls[0]?.path).toBe(`/sandboxes/${ID}/fork`);
  });
});

describe("credentials", () => {
  test("Boat key comes from the target, else the first sibling that has one", () => {
    expect(
      selectBoatApiKey({ BOAT_API_KEY: "a" }, [{ BOAT_API_KEY: "b" }]),
    ).toBe("a");
    expect(selectBoatApiKey({}, [{}, { BOAT_API_KEY: "b" }])).toBe("b");
    expect(selectBoatApiKey({ BOAT_API_KEY: "  " })).toBeUndefined();
  });
});
