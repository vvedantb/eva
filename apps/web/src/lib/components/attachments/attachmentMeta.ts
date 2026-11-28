import {
  IconFile,
  IconFileTypeTxt,
  IconHtml,
  IconMarkdown,
  type Icon,
} from "@tabler/icons-react";
import { toast } from "@vvedantb/ui";
import {
  attachmentFileKind,
  chatAttachmentErrorMessage,
  isAllowedAttachmentFile,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  type AttachmentFileKind,
} from "@eva/shared";

export {
  chatAttachmentErrorMessage,
  contentTypeForUpload,
  isAllowedAttachmentFile,
  isImageContentType,
  labelForAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  type AttachmentFileMeta,
} from "@eva/shared";

/** Pasted plain text longer than this attaches as a `.txt` file instead. */
export const PASTE_ATTACHMENT_THRESHOLD_CHARS = 2000;

/** Images only — ComposerPlusMenu "Add photos" picker. */
export const IMAGE_ATTACHMENT_ACCEPT = "image/*";

/**
 * All chat composers (sessions, sandbox, quick tasks): images plus
 * design/spec text files (Claude Design HTML exports, markdown/txt specs).
 */
export const CHAT_ATTACHMENT_ACCEPT =
  "image/*,text/html,text/markdown,text/plain,.html,.htm,.md,.txt";

/** Icon for a non-image attachment, keyed by MIME type or extension. */
export function iconForAttachment(
  filename: string | undefined,
  contentType: string | null | undefined,
): Icon {
  return ATTACHMENT_ICONS[attachmentFileKind(filename, contentType)];
}

const ATTACHMENT_ICONS: Record<AttachmentFileKind, Icon> = {
  markdown: IconMarkdown,
  html: IconHtml,
  text: IconFileTypeTxt,
  file: IconFile,
};

/**
 * Splits picked or pasted files into the ones a task or composer accepts,
 * given how many it already holds, and toasts once per kind of rejection.
 */
export function acceptAttachmentFiles(
  files: File[],
  currentCount: number,
): File[] {
  const rejections = new Set<"max_files" | "max_file_size" | "accept">();
  const accepted: File[] = [];
  for (const file of files) {
    if (!isAllowedAttachmentFile({ mediaType: file.type, filename: file.name })) {
      rejections.add("accept");
    } else if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      rejections.add("max_file_size");
    } else if (currentCount + accepted.length >= MAX_CHAT_ATTACHMENTS) {
      rejections.add("max_files");
    } else {
      accepted.push(file);
    }
  }
  for (const code of rejections) {
    toast.error(chatAttachmentErrorMessage({ code }));
  }
  return accepted;
}

/** Build a plain-text File for a large paste that should attach instead of inline. */
export function buildPastedTextFile(text: string): File {
  return new File([text], "pasted-text.txt", { type: "text/plain" });
}

/**
 * Attach pasted text as a file when over the threshold and under the cap.
 * Returns true when attached (caller should preventDefault); false when the
 * caller should insert the text inline (under threshold or at attachment cap).
 */
export function attachPastedTextIfLarge(
  text: string,
  currentCount: number,
  add: (files: File[]) => void,
): boolean {
  if (text.length < PASTE_ATTACHMENT_THRESHOLD_CHARS) return false;
  if (currentCount >= MAX_CHAT_ATTACHMENTS) return false;
  add([buildPastedTextFile(text)]);
  return true;
}
