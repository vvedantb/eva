"use client";

import { useRef, type RefObject } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { toast, usePromptInputController } from "@eva/ui";
import {
  isAllowedAttachmentFile,
  labelForAttachment,
  MAX_CHAT_ATTACHMENTS,
} from "@/lib/components/attachments/attachmentMeta";
import { useUploadChatAttachments } from "@/lib/components/chat/imageAttachments";
import { tokenizedToEditable } from "@/lib/components/mentions";
import type { MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";

export type PromptStashEntry = FunctionReturnType<
  typeof api.promptStash.listForRepo
>[number];

type StashAttachment = PromptStashEntry["attachments"][number];

function filenameForAttachment(contentType: string | null): string {
  return labelForAttachment(undefined, contentType);
}

function contentTypeForFile(
  contentType: string | null,
  blobType: string,
): string {
  if (contentType === null || contentType === "") return blobType;
  return contentType;
}

/** Fetches stash attachment URLs into File objects. Returns null on any failure. */
async function filesFromStashAttachments(
  attachments: StashAttachment[],
): Promise<File[] | null> {
  const files: File[] = [];
  for (const attachment of attachments) {
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const type = contentTypeForFile(attachment.contentType, blob.type);
      files.push(
        new File([blob], filenameForAttachment(attachment.contentType), {
          type,
        }),
      );
    } catch {
      return null;
    }
  }
  return files;
}

/**
 * Live prompt-stash queue for one repo + helpers to stash / restore / remove.
 * Bind list query directly — never mirror into React state.
 */
export function useComposerStash({
  repoId,
  mentionRef,
}: {
  repoId: Id<"githubRepos">;
  mentionRef: RefObject<MentionTextareaHandle | null>;
}) {
  const { textInput, attachments } = usePromptInputController();
  const uploadChatAttachments = useUploadChatAttachments();
  const entries = useQuery(api.promptStash.listForRepo, { repoId }) ?? [];

  const addStash = useMutation(api.promptStash.add);
  const removeStash = useMutation(api.promptStash.remove).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.promptStash.listForRepo, {
        repoId,
      });
      if (current === undefined) return;
      localStore.setQuery(
        api.promptStash.listForRepo,
        { repoId },
        current.filter((entry) => entry._id !== args.id),
      );
    },
  );

  const isStashingRef = useRef(false);
  const isRestoringRef = useRef(false);

  const stash = async (): Promise<boolean> => {
    if (isStashingRef.current) return false;
    isStashingRef.current = true;

    const visible = textInput.value;
    const files = attachments.files;
    const trimmed = visible.trim();
    if (trimmed.length === 0 && files.length === 0) {
      isStashingRef.current = false;
      return false;
    }

    // Snapshot before any await so concurrent edits don't race the clear.
    const visibleSnapshot = visible;
    const filesSnapshot = files;
    // Resolved outside try — React Compiler bails on ?? / ?. inside try/catch.
    const editor = mentionRef.current;
    const tokenized = editor
      ? editor.tokenize(visibleSnapshot.trim())
      : visibleSnapshot.trim();

    let attachmentStorageIds: Id<"_storage">[] = [];
    try {
      if (filesSnapshot.length > 0) {
        const uploads = await uploadChatAttachments(filesSnapshot);
        attachmentStorageIds = uploads.ids;
        // Stricter than send: stash clears the composer, so partial upload
        // must abort and leave the draft untouched.
        if (attachmentStorageIds.length !== filesSnapshot.length) {
          toast.error("Could not upload attachments to stash.");
          isStashingRef.current = false;
          return false;
        }
      }
    } catch {
      toast.error("Could not upload attachments to stash.");
      isStashingRef.current = false;
      return false;
    }

    const storageIdsArg =
      attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined;

    try {
      // Orphaned blobs if add throws after upload — same accepted risk as send.
      const result = await addStash({
        repoId,
        content: tokenized,
        attachmentStorageIds: storageIdsArg,
      });

      textInput.clear();
      attachments.clear();

      if (result.evicted) {
        toast.message("Oldest stash removed (limit 20 per app).");
      }

      isStashingRef.current = false;
      return true;
    } catch {
      toast.error("Could not stash prompt.");
      isStashingRef.current = false;
      return false;
    }
  };

  const restore = async (entry: PromptStashEntry): Promise<boolean> => {
    if (isRestoringRef.current) return false;
    isRestoringRef.current = true;

    for (const attachment of entry.attachments) {
      const mediaType =
        attachment.contentType === null ? undefined : attachment.contentType;
      if (!isAllowedAttachmentFile({ mediaType })) {
        toast.error("This stash has attachments this composer cannot accept.");
        isRestoringRef.current = false;
        return false;
      }
    }

    if (
      attachments.files.length + entry.attachments.length >
      MAX_CHAT_ATTACHMENTS
    ) {
      toast.error(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files.`);
      isRestoringRef.current = false;
      return false;
    }

    const restoredFiles = await filesFromStashAttachments(entry.attachments);
    if (restoredFiles === null) {
      toast.error("Could not load stashed attachments.");
      isRestoringRef.current = false;
      return false;
    }

    const { displayText, mentionMap, skillMap } = tokenizedToEditable(
      entry.content,
    );
    mentionRef.current?.addTokenMaps(mentionMap, skillMap);

    const current = textInput.value;
    const next =
      current.trim() === "" ? displayText : `${current}\n\n${displayText}`;
    textInput.setInput(next);

    if (restoredFiles.length > 0) {
      attachments.add(restoredFiles);
    }
    mentionRef.current?.focus();

    try {
      await removeStash({ id: entry._id });
    } catch {
      // Content already restored — leave the entry so it is not lost.
      toast.error("Restored, but could not remove stash entry.");
    }

    isRestoringRef.current = false;
    return true;
  };

  const removeEntry = async (id: Id<"promptStashes">): Promise<void> => {
    try {
      await removeStash({ id });
    } catch {
      toast.error("Could not delete stash.");
    }
  };

  return { entries, stash, restore, removeEntry };
}
