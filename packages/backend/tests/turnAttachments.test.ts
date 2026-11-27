import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { materializeTurnAttachments } from "../callback-src/runtime/turnAttachments.js";
import {
  attachmentExtensionForMimeType,
  attachmentSandboxPath,
  buildAttachmentPromptNote,
} from "../convex/_sandbox_runtime/attachments";

type StubReply =
  | { status: number; contentType?: string; body?: string }
  | "network-error";

function stubFetch(replies: readonly StubReply[]): string[] {
  const requested: string[] = [];
  let next = 0;
  spyOn(globalThis, "fetch").mockImplementation((input) => {
    requested.push(input instanceof Request ? input.url : String(input));
    const reply = replies[next] ?? { status: 404 };
    next += 1;
    if (reply === "network-error") {
      return Promise.reject(new Error("socket hang up"));
    }
    return Promise.resolve(
      new Response(new TextEncoder().encode(reply.body ?? ""), {
        status: reply.status,
        headers:
          reply.contentType === undefined
            ? undefined
            : { "content-type": reply.contentType },
      }),
    );
  });
  return requested;
}

function clearWrittenAttachments(): void {
  for (const name of readdirSync("/tmp")) {
    if (name.startsWith("eva-attachment-")) {
      rmSync(join("/tmp", name), { force: true });
    }
  }
}

afterEach(() => {
  mock.restore();
  clearWrittenAttachments();
});

describe("materializeTurnAttachments", () => {
  test("a turn with no attachments downloads nothing and keeps its prompt", () => {
    const requested = stubFetch([]);
    const turn = { prompt: "Ship the button rename.", attachmentUrls: [] };

    return materializeTurnAttachments(turn).then(() => {
      expect(requested).toEqual([]);
      expect(turn.prompt).toBe("Ship the button rename.");
    });
  });

  test("each attachment lands on disk and in the prompt, in order", async () => {
    stubFetch([
      { status: 200, contentType: "image/png", body: "screenshot-bytes" },
      { status: 200, contentType: "text/markdown", body: "# spec" },
    ]);
    const turn = {
      prompt: "Match this design.",
      attachmentUrls: ["https://example.test/a", "https://example.test/b"],
    };

    await materializeTurnAttachments(turn);

    expect(readFileSync("/tmp/eva-attachment-0.png", "utf8")).toBe(
      "screenshot-bytes",
    );
    expect(readFileSync("/tmp/eva-attachment-1.md", "utf8")).toBe("# spec");
    expect(turn.prompt).toBe(
      "Match this design." +
        buildAttachmentPromptNote([
          "/tmp/eva-attachment-0.png",
          "/tmp/eva-attachment-1.md",
        ]),
    );
  });

  test("a failed download is skipped and the survivor keeps its own index", async () => {
    stubFetch([
      { status: 502 },
      { status: 200, contentType: "image/webp", body: "second" },
    ]);
    const turn = {
      prompt: "Two files.",
      attachmentUrls: ["https://example.test/a", "https://example.test/b"],
    };

    await materializeTurnAttachments(turn);

    expect(readFileSync("/tmp/eva-attachment-1.webp", "utf8")).toBe("second");
    expect(turn.prompt).toBe(
      "Two files." + buildAttachmentPromptNote(["/tmp/eva-attachment-1.webp"]),
    );
  });

  test("a download that throws is skipped rather than failing the turn", async () => {
    stubFetch(["network-error"]);
    const turn = {
      prompt: "One file.",
      attachmentUrls: ["https://example.test/a"],
    };

    await expect(materializeTurnAttachments(turn)).resolves.toBeUndefined();
    expect(turn.prompt).toBe("One file.");
  });

  test("no note is appended when every download fails", async () => {
    stubFetch([{ status: 404 }, "network-error"]);
    const turn = {
      prompt: "Nothing survives.",
      attachmentUrls: ["https://example.test/a", "https://example.test/b"],
    };

    await materializeTurnAttachments(turn);

    expect(turn.prompt).toBe("Nothing survives.");
    expect(readdirSync("/tmp").filter((n) => n.startsWith("eva-attachment-")))
      .toEqual([]);
  });
});

describe("the daemon path matches the CLI launch path", () => {
  const MIME_TYPES = [
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/png",
    "text/html",
    "text/markdown",
    "text/plain",
    "image/heic",
    "application/pdf",
    "",
    "IMAGE/PNG; charset=utf-8",
    "text/plain;charset=UTF-8",
  ];

  test.each(MIME_TYPES)("%j maps to the same extension", async (mimeType) => {
    stubFetch([{ status: 200, contentType: mimeType, body: "bytes" }]);
    const turn = {
      prompt: "One file.",
      attachmentUrls: ["https://example.test/a"],
    };

    await materializeTurnAttachments(turn);

    const expected = attachmentSandboxPath(
      0,
      attachmentExtensionForMimeType(mimeType),
    );
    expect(existsSync(expected)).toBe(true);
    expect(turn.prompt).toBe(
      "One file." + buildAttachmentPromptNote([expected]),
    );
  });

  test("a missing content-type header falls back the same way", async () => {
    stubFetch([{ status: 200, body: "bytes" }]);
    const turn = {
      prompt: "One file.",
      attachmentUrls: ["https://example.test/a"],
    };

    await materializeTurnAttachments(turn);

    expect(existsSync(attachmentSandboxPath(0, ".bin"))).toBe(true);
    expect(attachmentExtensionForMimeType("")).toBe(".bin");
  });
});
