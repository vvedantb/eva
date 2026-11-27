import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import {
  acceptAttachmentFiles,
  contentTypeForUpload,
} from "@/lib/components/attachments/attachmentMeta";
import { useUploadBlobs } from "@/lib/components/attachments/useUploadBlobs";
import { withMutationToast } from "@/lib/utils/mutationToast";

/**
 * Adds picked or pasted files to an existing task: same rules as the create
 * modal, uploaded at once and attached to the task (no local draft to hold).
 * The task's next run gives them to the agent.
 */
export function useAddTaskFiles(taskId: Id<"agentTasks">) {
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId });
  const addAttachments = useMutation(api.agentTasks.addAttachments);
  const uploadBlobs = useUploadBlobs();
  const [isUploading, setIsUploading] = useState(false);

  const add = async (files: File[]) => {
    if (attachments === undefined || isUploading) return;
    const accepted = acceptAttachmentFiles(files, attachments.length);
    if (accepted.length === 0) return;
    setIsUploading(true);
    const uploaded = await uploadBlobs(
      accepted.map((file) => ({
        blob: file,
        contentType: contentTypeForUpload(
          { mediaType: file.type, filename: file.name },
          file.type,
        ),
      })),
    );
    const storageIds = uploaded.filter(
      (id): id is Id<"_storage"> => id !== null,
    );
    if (storageIds.length < accepted.length) {
      toast.error("Some files failed to upload and were left off.");
    }
    if (storageIds.length > 0) {
      await withMutationToast(
        addAttachments({ taskId, storageIds }),
        storageIds.length === 1 ? "File added" : "Files added",
        "Couldn't add files",
        "task-file-add",
      ).catch(() => undefined);
    }
    setIsUploading(false);
  };

  return { add, isUploading };
}
