import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { SandboxHandle } from "../_sandbox/provider";
import { writeSandboxFile } from "./sandboxFiles";

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
