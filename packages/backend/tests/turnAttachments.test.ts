import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { materializeTurnAttachments } from "../callback-src/runtime/turnAttachments.js";
import {
  attachmentExtensionForMimeType,
  attachmentSandboxPath,
  buildAttachmentPromptNote,
} from "../convex/_sandbox_runtime/attachments";

/**
 * Input attachments reach the agent as files on disk plus a prompt note naming
 * them. Every failure mode here is silent: the turn still runs, the agent just
 * never sees the screenshot the user pasted — or worse, is told to read a path
 * that was never written. Refactor 9cc9bbcc collapsed three copied daemon
 * implementations into `materializeTurnAttachments`, so a mistake in it now
 * costs Claude, Codex and Cursor at once.
 */

type StubReply =
  | { status: number; contentType?: string; body?: string }
  | "network-error";

/** Replies to the materialiser's downloads in order. Returns the URLs it asked for. */
function stubFetch(replies: readonly StubReply[]): string[] {
  const requested: string[] = [];
  let next = 0;
  vi.stubGlobal("fetch", (input: string | URL): Promise<Response> => {
    requested.push(String(input));
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

/** The materialiser writes to fixed `/tmp` paths, so each case starts clean. */
function clearWrittenAttachments(): void {
  for (const name of readdirSync("/tmp")) {
    if (name.startsWith("eva-attachment-")) {
      rmSync(join("/tmp", name), { force: true });
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    // The daemons pass their claimed turn straight through and then send
    // `turn.prompt` to the provider, so the note has to be appended in place.
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
    // Naming by download count instead of attachment index would silently
    // rename the survivor, and a second turn could then overwrite it.
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
    // A note listing files that were never written is worse than no note: the
    // agent burns the turn reporting that it cannot read them.
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

/**
 * The daemon path (`callback-src`) and the CLI launch path
 * (`convex/_sandbox_runtime/attachments.ts`) are separate bundles that cannot
 * import each other, so the filename scheme, extension table and note text are
 * duplicated by design. Drift means an attachment that works on a cold launch
 * disappears on the next turn of the same session — pinned here against the
 * launch path's own helpers rather than restated by hand.
 */
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
    // Unknown image subtype: pasted screenshots used to arrive like this.
    "image/heic",
    "application/pdf",
    "",
    // Parameters and casing come off the wire and must not reach the table.
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
