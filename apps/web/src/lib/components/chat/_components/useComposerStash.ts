"use client";

import { useRef, type RefObject } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { toast, usePromptInputController } from "@vvedantb/ui";
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
  const files = await Promise.all(attachments.map(fileFromStashAttachment));
  if (files.includes(null)) return null;
  return files.filter((file) => file !== null);
}

async function fileFromStashAttachment(
  attachment: StashAttachment,
): Promise<File | null> {
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = contentTypeForFile(attachment.contentType, blob.type);
    return new File([blob], filenameForAttachment(attachment.contentType), {
      type,
    });
  } catch {
    return null;
  }
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
      patchLoadedQuery(localStore, api.promptStash.listForRepo, { repoId }, (current) =>
        current.filter((entry) => entry._id !== args.id),
      );
    },
  );

  // One lock for both: a restore landing mid-stash used to be wiped by the
  // stash's clear after it had already deleted the entry server-side.
  const busyRef = useRef(false);

  const stash = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;

    const visible = textInput.value;
    const files = attachments.files;
    const trimmed = visible.trim();
    if (trimmed.length === 0 && files.length === 0) {
      busyRef.current = false;
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

    // Text clears now, not after the upload: anything typed while the upload
    // and add run lands in an empty composer and survives. Failure paths put
    // the stashed text back. (`textInput.value` is a render snapshot, so the
    // live text cannot be read after an await to merge it instead.)
    textInput.clear();
    const putTextBack = () => textInput.setInput(visibleSnapshot);

    let attachmentStorageIds: Id<"_storage">[] = [];
    try {
      if (filesSnapshot.length > 0) {
        const uploads = await uploadChatAttachments(filesSnapshot);
        attachmentStorageIds = uploads.ids;
        // Stricter than send: stash clears the composer, so partial upload
        // must abort and leave the draft untouched.
        if (attachmentStorageIds.length !== filesSnapshot.length) {
          toast.error("Could not upload attachments to stash.");
          putTextBack();
          busyRef.current = false;
          return false;
        }
      }
    } catch {
      toast.error("Could not upload attachments to stash.");
      putTextBack();
      busyRef.current = false;
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

      // Only the stashed files: ones added during the upload stay attached.
      filesSnapshot.forEach((file) => attachments.remove(file.id));

      if (result.evicted) {
        toast.message("Oldest stash removed (limit 20 per app).");
      }

      busyRef.current = false;
      return true;
    } catch {
      toast.error("Could not stash prompt.");
      putTextBack();
      busyRef.current = false;
      return false;
    }
  };

  const restore = async (entry: PromptStashEntry): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;

    for (const attachment of entry.attachments) {
      const mediaType =
        attachment.contentType === null ? undefined : attachment.contentType;
      if (!isAllowedAttachmentFile({ mediaType })) {
        toast.error("This stash has attachments this composer cannot accept.");
        busyRef.current = false;
        return false;
      }
    }

    if (
      attachments.files.length + entry.attachments.length >
      MAX_CHAT_ATTACHMENTS
    ) {
      toast.error(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files.`);
      busyRef.current = false;
      return false;
    }

    const restoredFiles = await filesFromStashAttachments(entry.attachments);
    if (restoredFiles === null) {
      toast.error("Could not load stashed attachments.");
      busyRef.current = false;
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

    busyRef.current = false;
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
