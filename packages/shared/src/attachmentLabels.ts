/**
 * How a user-attached file is named and drawn, for every surface that shows
 * one (the web composer, chat, quick tasks and task detail, and the phone
 * chat). Stored attachments are only storage ids, so once uploaded the
 * original filename is gone and the content type is the fallback.
 */

/** The file name's extension, lower case with its dot (`.md`), or "". */
export function filenameExtension(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}

/** The MIME type without parameters, lower case (`text/html; charset=utf-8` → `text/html`). */
export function normalizeContentType(
  contentType: string | null | undefined,
): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isImageContentType(
  contentType: string | null | undefined,
): boolean {
  return normalizeContentType(contentType).startsWith("image/");
}

/** The kind of a non-image attachment, for its icon. */
export type AttachmentFileKind = "markdown" | "html" | "text" | "file";

/** The kind of a non-image attachment, keyed by MIME type or extension. */
export function attachmentFileKind(
  filename: string | undefined,
  contentType: string | null | undefined,
): AttachmentFileKind {
  const type = normalizeContentType(contentType);
  const ext = filenameExtension(filename ?? "");
  if (
    type === "text/markdown" ||
    type === "text/x-markdown" ||
    ext === ".md" ||
    ext === ".markdown"
  ) {
    return "markdown";
  }
  if (type === "text/html" || ext === ".html" || ext === ".htm") return "html";
  if (type === "text/plain" || ext === ".txt") return "text";
  return "file";
}

/** Display name for an attachment: its file name, else a name from its content type. */
export function labelForAttachment(
  filename: string | undefined,
  contentType: string | null | undefined,
): string {
  if (filename?.trim()) return filename.trim();
  const type = normalizeContentType(contentType);
  if (type === "text/html") return "design.html";
  if (type === "text/markdown") return "spec.md";
  if (type === "text/plain") return "notes.txt";
  if (type.startsWith("image/")) return "Image";
  return "Attachment";
}

/** A stored attachment or capture, as `messages.listByParent` resolves it. */
export type ResolvedMediaEntry = {
  url: string | null;
  contentType: string | null;
};

/**
 * A user message's attachments: the typed entries, else the legacy URL list
 * (images only, before content types were stored), without the ones whose
 * blob is gone.
 */
export function messageAttachments(message: {
  attachments?: ResolvedMediaEntry[];
  attachmentUrls?: Array<string | null>;
}): Array<{ url: string; contentType: string | null }> {
  const entries =
    message.attachments ??
    message.attachmentUrls?.map((url) => ({
      url,
      contentType: url ? "image/*" : null,
    })) ??
    [];
  return entries.flatMap((entry) =>
    entry.url ? [{ url: entry.url, contentType: entry.contentType }] : [],
  );
}

/**
 * An agent's captures split the one way Eva draws them: videos as players,
 * everything else as images in one gallery. Captures whose blob is gone are
 * left out.
 */
export function splitAgentMedia(entries: readonly ResolvedMediaEntry[]): {
  videos: string[];
  images: string[];
} {
  const videos: string[] = [];
  const images: string[] = [];
  for (const entry of entries) {
    if (!entry.url) continue;
    if (entry.contentType?.startsWith("video/")) videos.push(entry.url);
    else images.push(entry.url);
  }
  return { videos, images };
}
