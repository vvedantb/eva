import { Sandbox } from "@vercel/sandbox";
import { describe, expect, test } from "vitest";

/**
 * The unpatched SDK resumes a stopped sandbox on any exec (`withResume`). A
 * background job that ran after Stop woke the VM and it billed for hours while
 * Eva showed it closed (Oct 2026). `patches/@vercel__sandbox@3.5.1.patch` adds
 * `setAutoResume(false)`; Eva sets it on every handle (`withoutLazyResume`).
 * These tests drive the patched SDK against a fake Vercel API.
 */

const now = Date.now();
const session = (status: "running" | "stopped") => ({
  id: `sess-${status}`,
  memory: 2048,
  vcpus: 1,
  region: "cdg1",
  timeout: 60_000,
  status,
  requestedAt: now,
  createdAt: now,
  cwd: "/tmp",
  updatedAt: now,
});

function fakeVercel(initial: "running" | "stopped") {
  let status = initial;
  const requests: string[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    requests.push(`${method} ${url.pathname}${url.search}`);
    if (method === "GET" && url.pathname.endsWith("/v2/sandboxes/sbx")) {
      if (url.searchParams.get("resume") === "true") status = "running";
      return Response.json({
        sandbox: {
          name: "sbx",
          persistent: true,
          createdAt: now,
          updatedAt: now,
          currentSessionId: `sess-${status}`,
          status,
        },
        session: session(status),
        routes: [],
        resumed: url.searchParams.get("resume") === "true",
      });
    }
    // Any session call on a stopped VM: Vercel answers 410 Gone.
    return Response.json(
      { error: { code: "sandbox_stopped", message: "stopped" } },
      { status: 410 },
    );
  };
  const get = () =>
    Sandbox.get({
      name: "sbx",
      resume: false,
      token: "t",
      teamId: "team",
      projectId: "prj",
      fetch: fakeFetch,
    });
  return { get, requests, status: () => status };
}

describe("patched Vercel SDK: lazy resume off", () => {
  test("a command on a stopped sandbox throws and never resumes it", async () => {
    const api = fakeVercel("stopped");
    const sandbox = await api.get();
    sandbox.setAutoResume(false);
    await expect(sandbox.runCommand("echo", ["1"])).rejects.toThrow(
      /not running .*auto-resume is disabled/,
    );
    expect(api.status()).toBe("stopped");
    expect(api.requests.some((r) => r.includes("resume=true"))).toBe(false);
  });

  test("control: the default still resumes (why the patch exists)", async () => {
    const api = fakeVercel("stopped");
    const sandbox = await api.get();
    await sandbox.runCommand("echo", ["1"]).catch(() => undefined);
    expect(api.requests.some((r) => r.includes("resume=true"))).toBe(true);
    expect(api.status()).toBe("running");
  });
});
