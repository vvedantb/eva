import { describe, expect, test } from "bun:test";
import { SandboxProviderError } from "../convex/_sandbox/provider";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
  SandboxGoneError,
  classifyProviderDetail,
  classifySandboxError,
  isSandboxGoneError,
  isSandboxUnresponsiveError,
} from "../convex/_sandbox_runtime/sandboxErrors";

class FakeApiError extends Error {
  readonly response: { status: number };
  constructor(status: number) {
    super(`Status code ${status} is not ok`);
    this.response = { status };
  }
}

class FakeNotOk extends Error {
  readonly response: { statusCode: number; responseText: string };
  constructor(statusCode: number) {
    super(`HTTP ${statusCode}: nope`);
    this.name = "NotOk";
    this.response = { statusCode, responseText: "nope" };
  }
}

describe("in-sandbox failures can never condemn the sandbox", () => {
  test("a SQL relation error from inside the VM is not a gone sandbox", () => {
    const error = new SandboxCommandFailedError(
      'Sandbox command failed (exit 1): ERROR: relation "public.CqcDiscoveryCandidate" does not exist',
      {
        exitCode: 1,
        output:
          'ERROR: relation "public.CqcDiscoveryCandidate" does not exist',
      },
    );
    expect(classifySandboxError(error)).toEqual({
      kind: "unknown",
      signal: "in-vm-command",
    });
    expect(isSandboxGoneError(error)).toBe(false);
  });

  test("in-VM output naming the sandbox is still not a gone sandbox", () => {
    const error = new SandboxCommandFailedError(
      "Sandbox command failed (exit 2): fatal: sandbox volume not found",
      { exitCode: 2, output: "fatal: sandbox volume not found" },
    );
    expect(isSandboxGoneError(error)).toBe(false);
  });

  test("a missing binary inside the VM is not a gone sandbox", () => {
    expect(
      isSandboxGoneError(
        new SandboxCommandFailedError(
          "Sandbox command failed (exit 127): bash: jq: command not found",
          { exitCode: 127, output: "bash: jq: command not found" },
        ),
      ),
    ).toBe(false);
  });

  test("a plain Error carrying command output is never classified", () => {
    expect(
      isSandboxGoneError(
        new Error(
          "git shell failed (exit 128): git fetch\nfatal: sandbox does not exist",
        ),
      ),
    ).toBe(false);
  });

  test("a bare string is never classified", () => {
    expect(isSandboxGoneError("sandbox not found")).toBe(false);
  });
});

describe("structured provider signals", () => {
  test("a 404 from the SDK's APIError is gone", () => {
    expect(classifySandboxError(new FakeApiError(404))).toEqual({
      kind: "sandbox-gone",
      signal: "http-status",
      httpStatus: 404,
    });
  });

  test("a 410 is gone", () => {
    expect(isSandboxGoneError(new FakeApiError(410))).toBe(true);
  });

  test("a 403 is auth, never gone", () => {
    expect(classifySandboxError(new FakeApiError(403)).kind).toBe("auth");
    expect(classifySandboxError(new FakeNotOk(401)).kind).toBe("auth");
  });

  test("rate limits and 5xx are transient, never gone", () => {
    expect(classifySandboxError(new FakeApiError(429)).kind).toBe("transient");
    expect(classifySandboxError(new FakeApiError(503)).kind).toBe("transient");
  });

  test("a 400 alone proves nothing", () => {
    expect(classifySandboxError(new FakeApiError(400)).kind).toBe("unknown");
  });

  test("the status survives eva wrapping the SDK error", () => {
    const wrapped = new SandboxProviderError(
      "vercel start: sandbox crimson-butterfly did not reach running within 180s",
      { httpStatus: 404, detail: '{"message":"Status code 404 is not ok"}' },
    );
    expect(classifySandboxError(wrapped)).toEqual({
      kind: "sandbox-gone",
      signal: "http-status",
      httpStatus: 404,
    });
  });

  test("a start timeout with no failed resume is not gone", () => {
    expect(
      isSandboxGoneError(
        new SandboxProviderError(
          "vercel start: sandbox crimson-butterfly did not reach running within 180s (state: starting)",
          { detail: "" },
        ),
      ),
    ).toBe(false);
  });

  test("a dropped command stream is transient, not gone", () => {
    const streamError = Object.assign(new Error("stream ended"), {
      name: "StreamError",
      code: "stream_ended_early",
    });
    expect(classifySandboxError(streamError).kind).toBe("transient");
  });
});

describe("provider message fallback", () => {
  test("a missing snapshot in the API body is gone", () => {
    expect(
      isSandboxGoneError(
        new SandboxProviderError("vercel start failed", {
          httpStatus: 400,
          detail: '{"error":{"code":"snapshot_not_found"}}',
        }),
      ),
    ).toBe(true);
  });

  test("only the provider detail is matched, never the message", () => {
    const error = new SandboxProviderError(
      'vercel exec failed (cmd=psql -c \'select * from sandbox where name = "does not exist"\')',
      { httpStatus: 400, detail: '{"message":"Status code 400 is not ok"}' },
    );
    expect(isSandboxGoneError(error)).toBe(false);
  });

  test("the raw matcher still recognises the provider's own wording", () => {
    expect(classifyProviderDetail("sandbox abc was deleted")).toBe(
      "sandbox-gone",
    );
    expect(classifyProviderDetail("invalid_snapshot")).toBe("sandbox-gone");
    expect(classifyProviderDetail("snapshot abc does not exist")).toBe(
      "sandbox-gone",
    );
    expect(classifyProviderDetail("did not reach running within 180s")).toBe(
      "unknown",
    );
  });
});

describe("unresponsive-VM signals", () => {
  test("exit 137 on a trivial command is unresponsive, never gone", () => {
    const error = new SandboxCommandFailedError(
      'Sandbox command failed with exit code 137 (cmd="echo 1")',
      { exitCode: 137, output: "" },
    );
    expect(isSandboxUnresponsiveError(error)).toBe(true);
    expect(isSandboxGoneError(error)).toBe(false);
  });

  test("a client-side exec timeout is unresponsive, never gone", () => {
    const error = new SandboxExecTimeoutError(
      "Sandbox exec (10s) timed out after 25000ms",
    );
    expect(isSandboxUnresponsiveError(error)).toBe(true);
    expect(isSandboxGoneError(error)).toBe(false);
  });

  test("ordinary command failures are not unresponsive", () => {
    expect(
      isSandboxUnresponsiveError(
        new SandboxCommandFailedError("Sandbox command failed (exit 1): nope", {
          exitCode: 1,
          output: "nope",
        }),
      ),
    ).toBe(false);
    expect(isSandboxUnresponsiveError(new Error("anything else"))).toBe(false);
    expect(isSandboxUnresponsiveError(new FakeApiError(400))).toBe(false);
  });
});

describe("eva's own verdict survives a rethrow", () => {
  test("an unresumable handle state is gone", () => {
    expect(
      isSandboxGoneError(new SandboxGoneError("sandbox unresumable state: gone")),
    ).toBe(true);
  });

  test("a refresh that already proved gone stays gone", () => {
    expect(
      classifySandboxError(
        new SandboxGoneError(
          "sandbox gone on refresh: Status code 404 is not ok",
        ),
      ).signal,
    ).toBe("eva-verdict");
  });

  test("the same wording in an untyped Error does not", () => {
    expect(
      isSandboxGoneError(
        new Error("sandbox gone on refresh: Status code 404 is not ok"),
      ),
    ).toBe(false);
  });
});
