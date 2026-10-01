"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@eva/ui";
import { IconArrowUpRight, IconPlus } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { mutationError, mutationSuccess } from "@/lib/utils/mutationToast";
import {
  SessionSourcePane,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import { DocumentList } from "./DocumentList";
import type { DocSourceArg } from "./_source";
import { useCreateAndOpenDoc } from "./useCreateAndOpenDoc";

/** Documents created from this session / task / project chat. */
export function useSourceDocuments(source: DocSourceArg) {
  const docs = useQuery(api.docs.listForSource, { source });
  return { docs, documentCount: docs?.length };
}

/**
 * Sandbox-pane list of documents generated in this chat. The same rows appear
 * in the repo Documents sidebar; cards open that viewer so both surfaces stay
 * one object. "New" creates a doc linked to this chat (notes for the task).
 */
export function SessionDocumentsPanel({ source }: { source: DocSourceArg }) {
  const { docs, documentCount } = useSourceDocuments(source);
  const { basePath } = useRepo();

  return (
    <SessionSourcePane
      title="Documents"
      count={documentCount}
      viewAll={
        <div className="flex shrink-0 items-center gap-1">
          <NewSourceDocumentButton source={source} />
          <Link
            to={toInternalRepoHref(`${basePath}/docs`)}
            search={(prev) => prev}
            className={sessionSourceViewAllClass}
          >
            View all
            <IconArrowUpRight size={14} />
          </Link>
        </div>
      }
      loading={docs === undefined}
    >
      <DocumentList
        docs={docs ?? []}
        basePath={basePath}
        showSource={false}
        emptyDescription="Create a note for this chat, or ask the agent to write one. Documents also appear in the Documents sidebar."
      />
    </SessionSourcePane>
  );
}

function NewSourceDocumentButton({ source }: { source: DocSourceArg }) {
  const { repoId, basePath } = useRepo();
  const createAndOpenDoc = useCreateAndOpenDoc(basePath);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsCreating(true);
    let opened = false;
    try {
      opened = await createAndOpenDoc({
        repoId,
        title: trimmed,
        content: "",
        source,
      });
    } catch {
      mutationError("Couldn't create document", "doc-create");
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
    if (!opened) return;
    setTitle("");
    setIsOpen(false);
    mutationSuccess("Document created", "doc-create");
  };

  return (
    <>
      <button
        type="button"
        aria-label="New document"
        title="New document"
        className={sessionSourceViewAllClass}
        onClick={() => setIsOpen(true)}
      >
        <IconPlus size={14} />
        New
      </button>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (isCreating) return;
          setIsOpen(open);
          if (!open) setTitle("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="e.g., Notes"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && title.trim()) {
                  void handleCreate();
                }
              }}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isCreating || !title.trim()}
              >
                {isCreating ? <Spinner size="sm" /> : "Create Document"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
