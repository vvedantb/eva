import {
  IconFile,
  IconFileTypeTxt,
  IconHtml,
  IconMarkdown,
  type Icon,
} from "@tabler/icons-react";
import {
  attachmentFileKind,
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

/**
 * Shared rules and labelling for user-attached files, used by the chat
 * composer, the quick task composer, and the task detail view. Keeping the
 * accept lists and limits in one place means every surface rejects the same
 * files with the same wording.
 */

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
