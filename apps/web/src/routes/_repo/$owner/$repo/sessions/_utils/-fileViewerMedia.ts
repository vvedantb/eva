// Maps a file path to the media kind the File Viewer should preview it as.
// Detection is by extension only: the client has to decide *before* reading
// which transport to use (text vs base64), so there are no bytes to sniff yet.

export type MediaFile = {
  kind: "image" | "video";
  /** MIME type used to build the `data:` URL handed to <img>/<video>. */
  mimeType: string;
};

const EXTENSION_TO_MEDIA: Record<string, MediaFile> = {
  png: { kind: "image", mimeType: "image/png" },
  jpg: { kind: "image", mimeType: "image/jpeg" },
  jpeg: { kind: "image", mimeType: "image/jpeg" },
  gif: { kind: "image", mimeType: "image/gif" },
  webp: { kind: "image", mimeType: "image/webp" },
  avif: { kind: "image", mimeType: "image/avif" },
  bmp: { kind: "image", mimeType: "image/bmp" },
  ico: { kind: "image", mimeType: "image/x-icon" },
  // SVG is text, but a rendered vector is more useful here than its markup.
  svg: { kind: "image", mimeType: "image/svg+xml" },
  mp4: { kind: "video", mimeType: "video/mp4" },
  m4v: { kind: "video", mimeType: "video/mp4" },
  webm: { kind: "video", mimeType: "video/webm" },
  mov: { kind: "video", mimeType: "video/quicktime" },
  ogv: { kind: "video", mimeType: "video/ogg" },
};

/** Returns the media descriptor for a file path, or null for non-media files. */
export function mediaFileForPath(path: string): MediaFile | null {
  const name = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  return EXTENSION_TO_MEDIA[name.slice(dot + 1)] ?? null;
}

/** True for files the viewer renders as markdown rather than as source. */
export function isMarkdownPath(path: string): boolean {
  return /\.mdx?$/i.test(path);
}
