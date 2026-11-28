"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  Button,
  Spinner,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { newProjectSubmitBlocker } from "@eva/shared";
import type { Id } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useBaseBranchState } from "@/lib/hooks/useBaseBranchState";
import { useNavigate } from "@tanstack/react-router";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { IconGitBranch } from "@tabler/icons-react";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import {
  DescriptionMentionEditor,
  type DescriptionMentionEditorHandle,
} from "@/lib/components/tasks/_components/DescriptionMentionEditor";
import { PriorityPicker } from "@/lib/components/priority/PriorityPicker";
import type { Priority } from "@/lib/components/priority/priorityMeta";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (projectId: Id<"projects">) => void;
}

/**
 * A new project from one prompt, as a new session starts: the prompt is the
 * project's brief, and the server titles the project from it. A project has
 * no interview or plan step: it opens on its coordinator chat. "Save"
 * (Ctrl/⌘+Enter; Enter is a newline) sends nothing; "Save and Run" also sends the prompt as the coordinator
 * chat's first message (`projects.create` `run`).
 */
export function NewProjectModal({
  isOpen,
  onClose,
  onCreated,
}: NewProjectModalProps) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const {
    baseBranch,
    setBaseBranch,
    repoDefaultBranch: defaultBranch,
  } = useBaseBranchState();
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const editorRef = useRef<DescriptionMentionEditorHandle>(null);

  const createProject = useMutation(api.projects.create);

  const resetForm = () => {
    setPrompt("");
    setBaseBranch(defaultBranch);
    setPriority(undefined);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const submitDisabledReason = newProjectSubmitBlocker(isLoading, prompt);
  const canSubmit = submitDisabledReason === undefined;

  const handleSubmit = async (run: boolean) => {
    if (!canSubmit) return;
    const rawInput = (editorRef.current?.tokenize(prompt) ?? prompt).trim();

    setIsLoading(true);
    try {
      const projectId = await withMutationToast(
        createProject({
          repoId: repo._id,
          rawInput,
          baseBranch,
          priority,
          run,
        }),
        "Project created",
        "Couldn't create project",
        "project-create",
      );

      resetForm();
      onClose();
      if (onCreated) {
        onCreated(projectId);
      } else {
        navigate({
          to: toInternalRepoHref(
            `${basePath}/projects/${projectId}/sandbox/documents`,
          ),
        });
      }
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  useShortcut(
    "submitComposerForm",
    (e) => {
      e.preventDefault();
      void handleSubmit(false);
    },
    { enabled: isOpen },
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          editorRef.current?.focus();
        }}
      >
        <div className="scrollbar px-5 pt-5 min-h-[160px] max-h-[50dvh] overflow-y-auto">
          <DescriptionMentionEditor
            ref={editorRef}
            value={prompt}
            onValueChange={setPrompt}
            placeholder="Describe the project… @ for data, / for skills."
            ariaLabel="Describe the project"
            minHeight="min-h-[160px]"
            className="rounded-none border-0 px-0 py-2 shadow-none focus-visible:ring-0"
            completionContext={`the brief of a coding project for the repository ${repo.owner}/${repo.name}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-5 py-3 max-sm:gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="max-sm:hit-target inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              >
                <IconGitBranch size={14} />
                <span className="text-foreground">{baseBranch}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <BranchSelect
                value={baseBranch}
                onValueChange={setBaseBranch}
                placeholder="Select a base branch"
                className="h-8 w-full"
              />
            </PopoverContent>
          </Popover>

          <PriorityPicker value={priority} onChange={setPriority} />

        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex gap-2 max-sm:w-full max-sm:flex-col-reverse">
                <Button
                  variant="secondary"
                  onClick={() => void handleSubmit(true)}
                  disabled={!canSubmit}
                  className="max-sm:w-full"
                >
                  Save and Run
                </Button>
                <Button
                  onClick={() => void handleSubmit(false)}
                  disabled={!canSubmit}
                  className="max-sm:w-full"
                >
                  {isLoading && <Spinner size="sm" />}
                  Save
                  <ShortcutKbd
                    id="submitComposerForm"
                    className="ml-1.5 border-0 bg-transparent p-0 text-current opacity-60"
                  />
                </Button>
              </span>
            </TooltipTrigger>
            {submitDisabledReason !== undefined && (
              <TooltipContent>{submitDisabledReason}</TooltipContent>
            )}
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
