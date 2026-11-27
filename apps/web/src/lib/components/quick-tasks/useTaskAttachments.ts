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
  name?: string;
  contentType: string | null;
  url: string | null;
  isObjectUrl: boolean;
  storageId: Id<"_storage"> | null;
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
