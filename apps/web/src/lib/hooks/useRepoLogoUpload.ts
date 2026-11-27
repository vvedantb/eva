import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { parseStorageId } from "@/lib/components/artifacts/_meta";
import { withMutationToast } from "@/lib/utils/mutationToast";

/**
 * Shared logo upload/remove logic for repo cards and the settings page. Owns the
 * single-request Convex storage upload (logos are small, so no chunking) and the
 * `uploading` flag; the current logo itself is read reactively from queries, so
 * this hook keeps no image state of its own.
 */
export function useRepoLogoUpload() {
  const generateUploadUrl = useMutation(api.githubRepos.generateLogoUploadUrl);
  const setLogo = useMutation(api.githubRepos.setLogo);
  const [uploading, setUploading] = useState(false);

  const uploadLogo = async (repoId: Id<"githubRepos">, file: File) => {
    setUploading(true);
    const contentType = file.type || "application/octet-stream";
    const uploadAndSave = async () => {
      const uploadUrl = await generateUploadUrl({ repoId });
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file,
      });
      const responseText = await result.text();
      if (!result.ok) {
        throw new Error(
          `Logo upload failed (status ${result.status}): ${responseText}`,
        );
      }
      const storageId = parseStorageId(responseText);
      if (!storageId) {
        throw new Error("Invalid response from storage");
      }
      await setLogo({ repoId, storageId });
    };
    // `try`/`finally` without a `catch` bails the React Compiler out of this
    // whole file, so the reset is duplicated instead. See CLAUDE.md.
    try {
      await withMutationToast(
        uploadAndSave(),
        "Logo updated",
        "Couldn't upload logo",
        "repo-logo-upload",
      );
    } catch (error) {
      setUploading(false);
      throw error;
    }
    setUploading(false);
  };

  const removeLogo = async (repoId: Id<"githubRepos">) => {
    await withMutationToast(
      setLogo({ repoId, storageId: null }),
      "Logo removed",
      "Couldn't remove logo",
      "repo-logo-remove",
    );
  };

  return { uploadLogo, removeLogo, uploading };
}
