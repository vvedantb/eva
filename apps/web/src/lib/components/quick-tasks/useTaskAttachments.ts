import { useState } from "react";
import { toast } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  chatAttachmentErrorMessage,
  contentTypeForUpload,
  isAllowedAttachmentFile,
  isImageContentType,
} from "@/lib/components/attachments/attachmentMeta";
import { useUploadBlobs } from "@/lib/components/attachments/useUploadBlobs";

/** One file in the quick task composer, either picked locally or already stored. */
export type TaskAttachment = {
  key: string;
  /** Original filename. Absent for files loaded back from a draft. */
  name?: string;
  contentType: string | null;
  /** Object URL while composing, signed storage URL once loaded from a draft. */
  url: string | null;
  /** True when `url` is an object URL this hook is responsible for revoking. */
  isObjectUrl: boolean;
  /** Set once the blob is in Convex storage. */
  storageId: Id<"_storage"> | null;
  /** Set while the blob only exists in the browser. */
  file: File | null;
};

type RejectionCode = "max_files" | "max_file_size" | "accept";

/**
 * Attachment state for the quick task composer. Files are held locally and
 * uploaded on submit (matching the chat composer), so abandoning the modal
 * never leaves orphaned blobs in storage. Accept list and limits come from the
 * shared attachment rules, so quick tasks reject the same files as chat.
 */
export function useTaskAttachments() {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const uploadBlobs = useUploadBlobs();

  const revoke = (attachment: TaskAttachment) => {
    if (attachment.isObjectUrl && attachment.url) {
      URL.revokeObjectURL(attachment.url);
    }
  };

  const add = (files: File[]) => {
    const rejections = new Set<RejectionCode>();
    setAttachments((current) => {
      const accepted: TaskAttachment[] = [];
      for (const file of files) {
        const meta = { mediaType: file.type, filename: file.name };
        if (!isAllowedAttachmentFile(meta)) {
          rejections.add("accept");
          continue;
        }
        if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
          rejections.add("max_file_size");
          continue;
        }
        if (current.length + accepted.length >= MAX_CHAT_ATTACHMENTS) {
          rejections.add("max_files");
          continue;
        }
        // Only images need a preview URL; text attachments render as an icon.
        const isImage = isImageContentType(file.type);
        accepted.push({
          key: crypto.randomUUID(),
          name: file.name,
          contentType: file.type || null,
          url: isImage ? URL.createObjectURL(file) : null,
          isObjectUrl: isImage,
          storageId: null,
          file,
        });
      }
      return accepted.length > 0 ? [...current, ...accepted] : current;
    });
    for (const code of rejections) {
      toast.error(chatAttachmentErrorMessage({ code }));
    }
  };

  const remove = (key: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.key === key);
      if (target) revoke(target);
      return current.filter((item) => item.key !== key);
    });
  };

  /**
   * Replace one local attachment's content in place. Clears storageId so the
   * next upload() re-uploads the edited blob. Hydrated draft attachments
   * (storageId set, file === null) should not call this — open read-only.
   */
  const replace = (key: string, file: File) => {
    setAttachments((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        revoke(item);
        const isImage = isImageContentType(file.type);
        return {
          ...item,
          name: item.name,
          contentType: file.type || item.contentType,
          url: isImage ? URL.createObjectURL(file) : null,
          isObjectUrl: isImage,
          storageId: null,
          file,
        };
      }),
    );
  };

  const reset = () => {
    setAttachments((current) => {
      current.forEach(revoke);
      return [];
    });
  };

  /** Replaces the list with files already in storage (loading a saved draft). */
  const hydrate = (
    stored: Array<{
      storageId: Id<"_storage">;
      url: string | null;
      contentType: string | null;
    }>,
  ) => {
    setAttachments((current) => {
      current.forEach(revoke);
      return stored.map((item) => ({
        key: item.storageId,
        contentType: item.contentType,
        url: item.url,
        isObjectUrl: false,
        storageId: item.storageId,
        file: null,
      }));
    });
  };

  /**
   * Uploads any local files and returns every attachment's storage id in the
   * order the user attached them. Files that fail to upload are dropped with a
   * toast rather than blocking task creation.
   */
  const upload = async (): Promise<Id<"_storage">[]> => {
    const pending = attachments.filter(
      (item): item is TaskAttachment & { file: File } => item.file !== null,
    );
    const uploadedIds =
      pending.length > 0
        ? await uploadBlobs(
            pending.map((item) => ({
              blob: item.file,
              contentType: contentTypeForUpload(
                { mediaType: item.file.type, filename: item.file.name },
                item.file.type,
              ),
            })),
          )
        : [];

    const idByKey = new Map<string, Id<"_storage"> | null>(
      pending.map((item, index) => [item.key, uploadedIds[index] ?? null]),
    );
    if (uploadedIds.some((id) => id === null)) {
      toast.error("Some attachments failed to upload and were left off.");
    }

    // Mark uploaded files as stored so retrying a failed submit does not upload
    // the same blob twice. Object URLs stay valid for the previews.
    setAttachments((current) =>
      current.map((item) => {
        const uploaded = idByKey.get(item.key);
        return uploaded ? { ...item, storageId: uploaded, file: null } : item;
      }),
    );

    return attachments
      .map((item) => item.storageId ?? idByKey.get(item.key) ?? null)
      .filter((id): id is Id<"_storage"> => id !== null);
  };

  return { attachments, add, remove, replace, reset, hydrate, upload };
}
