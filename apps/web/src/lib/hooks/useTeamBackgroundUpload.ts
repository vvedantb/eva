import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { parseStorageId } from "@/lib/components/artifacts/_meta";

/**
 * Team sidebar-background upload/remove. Same Convex storage flow as
 * useTeamLogoUpload, scoped to backgroundStorageId.
 */
export function useTeamBackgroundUpload() {
  const generateUploadUrl = useMutation(api.teams.generateBackgroundUploadUrl);
  const setBackground = useMutation(api.teams.setBackground);
  const [uploading, setUploading] = useState(false);

  const uploadBackground = async (teamId: Id<"teams">, file: File) => {
    setUploading(true);
    let uploadError: Error | undefined;
    // Built outside the try: React Compiler bails on the whole file when a
    // logical expression sits inside a try/catch.
    const contentType = file.type || "application/octet-stream";
    try {
      const uploadUrl = await generateUploadUrl({ teamId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file,
      });
      const responseText = await result.text();
      if (!result.ok) {
        uploadError = new Error(
          `Background upload failed (status ${result.status}): ${responseText}`,
        );
      } else {
        const storageId = parseStorageId(responseText);
        if (!storageId) {
          uploadError = new Error("Invalid response from storage");
        } else {
          await setBackground({ teamId, storageId });
        }
      }
    } catch (error) {
      setUploading(false);
      throw error;
    }
    setUploading(false);
    if (uploadError) {
      throw uploadError;
    }
  };

  const removeBackground = async (teamId: Id<"teams">) => {
    await setBackground({ teamId, storageId: null });
  };

  return { uploadBackground, removeBackground, uploading };
}
