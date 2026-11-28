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

/**
 * The rules every composer (web and phone) applies to a user-attached file,
 * so each rejects the same files with the same wording: images, plus design
 * and spec text files (Claude Design HTML exports, Markdown and text specs).
 */
export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const SESSION_TEXT_EXTENSIONS: readonly string[] = [".html", ".htm", ".md", ".txt"];

/** The subset of file metadata the attachment rules need, from any source. */
export type AttachmentFileMeta = {
  mediaType?: string;
  filename?: string;
};

export function chatAttachmentErrorMessage(err: {
  code: "max_files" | "max_file_size" | "accept";
}): string {
  switch (err.code) {
    case "max_files":
      return `You can attach up to ${MAX_CHAT_ATTACHMENTS} files.`;
    case "max_file_size":
      return "Attachments must be 10 MB or smaller.";
    case "accept":
      return "Only images, HTML, Markdown, or plain text can be attached.";
  }
}

function isSessionTextAttachment(file: AttachmentFileMeta): boolean {
  const type = normalizeContentType(file.mediaType);
  if (
    type === "text/html" ||
    type === "text/markdown" ||
    type === "text/plain"
  ) {
    return true;
  }
  const ext = filenameExtension(file.filename ?? "");
  return SESSION_TEXT_EXTENSIONS.some((allowed) => allowed === ext);
}

export function isAllowedAttachmentFile(file: AttachmentFileMeta): boolean {
  if (isImageContentType(file.mediaType)) return true;
  return isSessionTextAttachment(file);
}

/**
 * Content type to store the blob under. Prefers what the source declared, then
 * what the blob reports, then the filename extension.
 */
export function contentTypeForUpload(
  file: AttachmentFileMeta,
  blobType: string,
): string {
  const declared = file.mediaType?.trim();
  if (declared) return declared;
  if (blobType) return blobType;
  switch (filenameExtension(file.filename ?? "")) {
    case ".html":
    case ".htm":
      return "text/html";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
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
  name?: string | null;
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

/** An agent capture ready to draw: its URL and caption. */
export type AgentMediaItem = { url: string; caption: string | null };

/**
 * A capture's caption from its sandbox file name: `empty-box-page.png` →
 * "Empty box page". Null when there is no name or nothing readable remains.
 */
export function mediaCaption(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * An agent's captures split the one way Eva draws them: videos as players,
 * everything else as images in one carousel. Captures whose blob is gone are
 * left out.
 */
export function splitAgentMedia(entries: readonly ResolvedMediaEntry[]): {
  videos: AgentMediaItem[];
  images: AgentMediaItem[];
} {
  const videos: AgentMediaItem[] = [];
  const images: AgentMediaItem[] = [];
  for (const entry of entries) {
    if (!entry.url) continue;
    const item = { url: entry.url, caption: mediaCaption(entry.name) };
    if (entry.contentType?.startsWith("video/")) videos.push(item);
    else images.push(item);
  }
  return { videos, images };
}
