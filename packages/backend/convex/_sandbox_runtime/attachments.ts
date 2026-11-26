import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { SandboxHandle } from "../_sandbox/provider";
import { writeSandboxFile } from "./sandboxFiles";

/**
 * Delivering user-attached input files to the agent.
 *
 * The composer uploads pasted/dropped files to Convex file storage. At launch
 * we download the bytes and write them into the sandbox filesystem as flat
 * `/tmp/eva-attachment-<n>.<ext>` files (flat avoids any per-provider mkdir
 * behaviour), then append a note to the prompt pointing the agent at them. The
 * agent reads them with its file-reading tool — the same path Claude Code, Codex,
 * Cursor, and opencode all support — so this works uniformly across providers.
 *
 * The session daemon uses the same filename scheme + note text (duplicated in
 * `callback-src`, which is a separate bundle and cannot import this module).
 */

/** Maps a mime type to a file extension. Defaults to `.bin` for unknown types. */
export function attachmentExtensionForMimeType(mimeType: string): string {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/png":
      return ".png";
    case "text/html":
      return ".html";
    case "text/markdown":
      return ".md";
    case "text/plain":
      return ".txt";
    default:
      // Pasted screenshots historically arrived without a reliable type.
      if (type.startsWith("image/")) return ".png";
      return ".bin";
  }
}

/** Absolute sandbox path for the nth attachment of a turn. */
export function attachmentSandboxPath(
  index: number,
  extension: string,
): string {
  return `/tmp/eva-attachment-${index}${extension}`;
}

/** The prompt suffix that tells the agent where the attached files live. */
export function buildAttachmentPromptNote(paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const list = paths.map((p) => `- ${p}`).join("\n");
  return `\n\n---\nThe user attached the following file(s). Read them with your file-reading tool before responding:\n${list}`;
}

/**
 * Downloads each attachment from Convex storage and writes it into the sandbox.
 * Returns the absolute sandbox paths written (skips ids that fail to resolve).
 */
export async function materializeAttachmentsToSandbox(
  ctx: ActionCtx,
  sandbox: SandboxHandle,
  storageIds: readonly Id<"_storage">[],
): Promise<string[]> {
  // A message carries a handful of files: download and write them together.
  const paths = await Promise.all(
    storageIds.map(async (storageId, index) => {
      const blob = await ctx.storage.get(storageId);
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = attachmentSandboxPath(
        index,
        attachmentExtensionForMimeType(blob.type),
      );
      await writeSandboxFile(sandbox, path, bytes);
      return path;
    }),
  );
  return paths.filter((path) => path !== null);
}
