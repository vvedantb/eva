import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { parseStorageId } from "@/lib/components/artifacts/_meta";

/**
 * Shared team logo upload/remove logic for team cards and the team detail page.
 * Mirrors useRepoLogoUpload: single-request Convex storage upload + setLogo.
 */
export function useTeamLogoUpload() {
  const generateUploadUrl = useMutation(api.teams.generateLogoUploadUrl);
  const setLogo = useMutation(api.teams.setLogo);
  const [uploading, setUploading] = useState(false);

  const uploadLogo = async (teamId: Id<"teams">, file: File) => {
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
          `Logo upload failed (status ${result.status}): ${responseText}`,
        );
      } else {
        const storageId = parseStorageId(responseText);
        if (!storageId) {
          uploadError = new Error("Invalid response from storage");
        } else {
          await setLogo({ teamId, storageId });
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

  const removeLogo = async (teamId: Id<"teams">) => {
    await setLogo({ teamId, storageId: null });
  };

  return { uploadLogo, removeLogo, uploading };
}
