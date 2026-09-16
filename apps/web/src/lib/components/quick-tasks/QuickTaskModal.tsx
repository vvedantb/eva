"use client";

import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  Button,
  Input,
  Spinner,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Badge,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@eva/ui";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import {
  api,
  DEFAULT_AI_MODEL,
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useBaseBranchState } from "@/lib/hooks/useBaseBranchState";
import {
  defaultProviderAccountId,
  providerAccountIdForModel,
} from "@/lib/utils/defaultProviderAccount";
import { toRunTraitArgs } from "@/lib/utils/runTraits";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import {
  IconFileText,
  IconTrash,
  IconGitBranch,
  IconTag,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconMicrophone,
  IconPlayerStop,
  IconLoader2,
} from "@tabler/icons-react";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import { useGatewayDictation } from "@/lib/hooks/useGatewayDictation";
import { useTranscriptPolish } from "@/lib/hooks/useTranscriptPolish";
import {
  DescriptionMentionEditor,
  type DescriptionMentionEditorHandle,
} from "@/lib/components/tasks/_components/DescriptionMentionEditor";
import { attachPastedTextIfLarge } from "@/lib/components/attachments/attachmentMeta";
import { tokenizedToEditable } from "@/lib/components/mentions";
import { PriorityPicker } from "@/lib/components/priority/PriorityPicker";
import type { Priority } from "@/lib/components/priority/priorityMeta";
import { NewProjectModal } from "@/lib/components/projects/NewProjectModal";
import { AssigneeSelector } from "./_components/AssigneeSelector";
import { ProjectPicker } from "./_components/ProjectPicker";
import { TaskFilesSection } from "./_components/TaskFilesSection";
import { useTaskAttachments } from "./useTaskAttachments";
import { QUICK_TASK_OPTION_BADGE_CLASS } from "./_utils/optionBadge";
import {
  draftCountAfterRemove,
  draftsAfterRemove,
  visibleDrafts,
} from "./_utils/draftVisibility";
import { withMutationToast } from "@/lib/utils/mutationToast";
import {
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

type User = FunctionReturnType<typeof api.users.listAll>[number];
type Project = FunctionReturnType<typeof api.projects.list>[number];
type QuickTaskDraft = FunctionReturnType<
  typeof api.agentTasks.listDrafts
>[number];

/**
 * Convex treats an empty array and an absent field differently, so empty lists
 * are sent as undefined. Written as a helper rather than an inline ternary
 * because React Compiler bails on a whole file when a conditional expression
 * sits inside a try/catch, and one of the call sites has to run post-await.
 */
function undefinedIfEmpty<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined;
}

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: Id<"projects">;
  users?: User[];
  projects?: Project[];
  allTags?: string[];
  /** Pre-load this draft when the modal opens via a deep link. */
  initialDraft?: QuickTaskDraft;
}

export function QuickTaskModal({
  isOpen,
  onClose,
  projectId,
  users,
  projects,
  allTags,
  initialDraft,
}: QuickTaskModalProps) {
  const { repo } = useRepo();
  const {
    baseBranch,
    setBaseBranch,
    repoDefaultBranch: defaultBranch,
  } = useBaseBranchState(initialDraft?.baseBranch);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [description, setDescription] = useState(() =>
    initialDraft
      ? tokenizedToEditable(initialDraft.description ?? "").displayText
      : "",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<Id<"agentTasks"> | null>(
    initialDraft?._id ?? null,
  );
  const [confirmDeleteId, setConfirmDeleteId] =
    useState<Id<"agentTasks"> | null>(null);
  const altHeld = useAltHeld();
  const [selectedProjectId, setSelectedProjectId] = useState<
    Id<"projects"> | undefined
  >(initialDraft?.projectId ?? projectId);
  const [assignedTo, setAssignedTo] = useState<Id<"users"> | undefined>(
    undefined,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialDraft?.tags ?? [],
  );
  const [tagSearch, setTagSearch] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const editorRef = useRef<DescriptionMentionEditorHandle>(null);
  const flags = useQuery(api.auth.getExperimentalFlags);
  const voiceEnabled = flags?.voiceDictation;
  const { isListening, isConnecting, toggle } =
    useGatewayDictation(setDescription);
  const { isPolishing, handleToggle } = useTranscriptPolish({
    value: description,
    setInput: setDescription,
  });

  // Seed the mention/skill maps from the initial draft's tokenized description
  // so that @-mention and /skill chips render correctly on deep-link open.
  const initialDescMaps = initialDraft
    ? tokenizedToEditable(initialDraft.description ?? "")
    : {
        mentionMap: new Map<string, string>(),
        skillMap: new Map<string, string>(),
      };

  const createQuickTask = useMutation(api.agentTasks.createQuickTask);
  const saveDraft = useMutation(api.agentTasks.saveDraft);
  const activateDraft = useMutation(api.agentTasks.activateDraft);
  const removeDraft = useMutation(api.agentTasks.remove).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.agentTasks.listDrafts, {
        repoId: repo._id,
      });
      if (current !== undefined) {
        localStore.setQuery(
          api.agentTasks.listDrafts,
          { repoId: repo._id },
          draftsAfterRemove(current, args.id),
        );
      }
      const count = localStore.getQuery(api.agentTasks.countDrafts, {
        repoId: repo._id,
      });
      if (count !== undefined) {
        localStore.setQuery(
          api.agentTasks.countDrafts,
          { repoId: repo._id },
          draftCountAfterRemove(count),
        );
      }
    },
  );
  const draftRows = useQuery(api.agentTasks.listDrafts, { repoId: repo._id });
  // `remove` only sets `deletedAt`; until listDrafts is deployed with that
  // index range, the query still returns the row and the trash looks broken.
  const drafts = draftRows === undefined ? undefined : visibleDrafts(draftRows);

  const attachments = useTaskAttachments();
  // Files already saved on the open draft, so reopening it keeps them.
  const draftAttachments = useQuery(
    api.agentTasks.listAttachments,
    activeDraftId ? { taskId: activeDraftId } : "skip",
  );
  const [hydratedDraftId, setHydratedDraftId] =
    useState<Id<"agentTasks"> | null>(null);
  if (activeDraftId && draftAttachments && hydratedDraftId !== activeDraftId) {
    setHydratedDraftId(activeDraftId);
    // An empty draft never clears files the user just attached.
    if (draftAttachments.length > 0) attachments.hydrate(draftAttachments);
  }

  const defaultModel = normalizeAIModel(repo.defaultModel ?? DEFAULT_AI_MODEL);
  const defaultTraits = storedTraitsFromRepoDefaults(repo);
  const [model, setModel] = useState<AIModel>(defaultModel);
  // Absent traits fall back to each model's own defaults, so an untouched menu
  // sends nothing and the task runs exactly as it does today.
  const [traits, setTraits] = useState<StoredModelTraits>(defaultTraits);
  const [providerAccountId, setProviderAccountId] = useState<string | null>(
    null,
  );
  const [accountDefaulted, setAccountDefaulted] = useState(false);

  // Drop-target highlight for the description pane. Depth-counted because
  // dragleave also fires when the pointer crosses onto a child of the pane.
  const [isDragOver, setIsDragOver] = useState(false);
  const dragEnterDepth = useRef(0);
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);
  const {
    options: accounts,
    resolveId: resolveAccountId,
    ready: accountsReady,
  } = useProviderAccounts();

  // Once accounts load, default to the creator's own account for the selected
  // model provider (Team when none match), leaving an existing pick that still
  // resolves alone. Adjust during render.
  if (accountsReady && !accountDefaulted) {
    if (!accounts.some((account) => account.id === providerAccountId)) {
      setProviderAccountId(defaultProviderAccountId(accounts, model));
    }
    setAccountDefaulted(true);
  }

  const effectiveProjectId = projectId ?? selectedProjectId;
  const effectiveProject = useQuery(
    api.projects.get,
    effectiveProjectId ? { id: effectiveProjectId } : "skip",
  );
  const branchLockedToProject = effectiveProjectId !== undefined;
  const displayBaseBranch = effectiveProject?.baseBranch ?? defaultBranch;

  const getDescription = () => {
    const tokenized = editorRef.current?.tokenize(description) ?? description;
    return tokenized.trim();
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setBaseBranch(defaultBranch);
    setModel(defaultModel);
    setTraits(defaultTraits);
    setProviderAccountId(defaultProviderAccountId(accounts, defaultModel));
    setAccountDefaulted(accounts.length > 0);
    setActiveDraftId(null);
    setSelectedProjectId(projectId);
    setAssignedTo(undefined);
    setSelectedTags([]);
    setTagSearch("");
    setPriority(undefined);
    setHydratedDraftId(null);
    attachments.reset();
  };

  const handleClose = async () => {
    const desc = getDescription().trim();
    if (title.trim() || desc || attachments.attachments.length > 0) {
      const attachmentStorageIds = await attachments.upload();
      await saveDraft({
        id: activeDraftId ?? undefined,
        repoId: repo._id,
        title: title.trim() || undefined,
        description: desc || undefined,
        baseBranch: branchLockedToProject ? undefined : baseBranch,
        projectId: selectedProjectId,
        attachmentStorageIds:
          attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined,
      });
    }
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!title.trim() || !displayBaseBranch || !repo) return;

    const desc = getDescription().trim();
    const taskBaseBranch = branchLockedToProject ? undefined : baseBranch;
    // Built before the try, and the post-await one via undefinedIfEmpty: React
    // Compiler bails on the whole file when a conditional, logical or
    // nullish-coalescing expression sits inside a try/catch.
    const taskDescription = desc || undefined;
    const taskAccountId = resolveAccountId(providerAccountId) ?? null;
    const taskTags = undefinedIfEmpty(selectedTags);
    const taskTraits = toRunTraitArgs(traits);
    setIsLoading(true);
    try {
      const attachmentStorageIds = await attachments.upload();
      const taskAttachmentIds = undefinedIfEmpty(attachmentStorageIds);
      if (activeDraftId) {
        await withMutationToast(
          activateDraft({
            id: activeDraftId,
            title: title.trim(),
            description: taskDescription,
            baseBranch: taskBaseBranch,
            model,
            providerAccountId: taskAccountId,
            ...taskTraits,
            tags: taskTags,
            assignedTo,
            attachmentStorageIds: taskAttachmentIds,
          }),
          "Task created",
          "Couldn't create task",
          "task-create",
        );
      } else {
        await withMutationToast(
          createQuickTask({
            repoId: repo._id,
            title: title.trim(),
            description: taskDescription,
            baseBranch: taskBaseBranch,
            model,
            providerAccountId: taskAccountId,
            ...taskTraits,
            projectId: selectedProjectId,
            tags: taskTags,
            assignedTo,
            priority,
            attachmentStorageIds: taskAttachmentIds,
          }),
          "Task created",
          "Couldn't create task",
          "task-create",
        );
      }
      resetForm();
      onClose();
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  const loadDraft = (draft: QuickTaskDraft) => {
    setTitle(draft.title ?? "");
    setDescription(draft.description ?? "");
    setBaseBranch(draft.baseBranch ?? defaultBranch);
    setActiveDraftId(draft._id);
    setSelectedProjectId(draft.projectId ?? projectId);
    setSelectedTags(draft.tags ?? []);
  };

  const handleDeleteDraft = async (draftId: Id<"agentTasks">) => {
    try {
      await withMutationToast(
        removeDraft({ id: draftId }),
        "Draft deleted",
        "Couldn't delete draft",
        "draft-delete",
      );
      setConfirmDeleteId(null);
      if (activeDraftId === draftId) {
        resetForm();
      }
    } catch {
      return;
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = (raw: string) => {
    const value = raw.trim();
    if (!value || selectedTags.includes(value)) return;
    setSelectedTags((prev) => [...prev, value]);
    setTagSearch("");
  };

  const canSubmit = !isLoading && !!title.trim() && !!displayBaseBranch;

  useShortcut(
    "submitComposerForm",
    (e) => {
      e.preventDefault();
      if (canSubmit) {
        handleSubmit();
      }
    },
    { enabled: isOpen },
  );

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(v) => {
          if (!v) handleClose();
        }}
      >
        <DialogContent className="max-w-3xl gap-0 p-0">
          <div className="px-5 pt-5 pb-1">
            <Input
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="border-0 shadow-none bg-transparent px-0 text-base font-medium focus-visible:ring-0 placeholder:text-muted-foreground/60"
            />
          </div>

          <div
            className={`transition-colors duration-[var(--motion-fast)] ${
              isDragOver ? "bg-primary/5" : ""
            }`}
            onDragEnter={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              dragEnterDepth.current += 1;
              setIsDragOver(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              dragEnterDepth.current = Math.max(0, dragEnterDepth.current - 1);
              if (dragEnterDepth.current === 0) setIsDragOver(false);
            }}
            onDrop={(e) => {
              dragEnterDepth.current = 0;
              setIsDragOver(false);
              const dropped = Array.from(e.dataTransfer.files);
              if (dropped.length === 0) return;
              e.preventDefault();
              attachments.add(dropped);
            }}
          >
            {/* `dvh`, not `vh`: mobile browser chrome makes `50vh` taller than
                half the visible area, which pushes the modal footer offscreen. */}
            <div className="scrollbar px-5 min-h-[160px] max-h-[50dvh] overflow-y-auto">
              <DescriptionMentionEditor
                ref={editorRef}
                value={description}
                onValueChange={setDescription}
                placeholder="Add description... @ for data, / for skills."
                minHeight="min-h-[160px]"
                className="rounded-none border-0 px-0 py-2 shadow-none focus-visible:ring-0"
                initialMentionMap={initialDescMaps.mentionMap}
                initialSkillMap={initialDescMaps.skillMap}
                completionContext={`the description of a coding task for the repository ${repo.owner}/${repo.name}${title ? `, titled "${title}"` : ""}`}
                onImageFiles={attachments.add}
                onLargeTextPaste={(text) =>
                  attachPastedTextIfLarge(
                    text,
                    attachments.attachments.length,
                    attachments.add,
                  )
                }
              />
            </div>

            <TaskFilesSection
              attachments={attachments.attachments}
              onAdd={attachments.add}
              onRemove={attachments.remove}
              onReplace={attachments.replace}
              draftTaskId={activeDraftId}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
            {voiceEnabled === true ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant={
                      isListening && !isConnecting ? "destructive" : "secondary"
                    }
                    onClick={() => handleToggle({ isListening, toggle })}
                    disabled={isLoading || isConnecting || isPolishing}
                    className="h-8 w-8"
                    aria-label={
                      isPolishing
                        ? "Polishing transcript"
                        : isConnecting
                          ? "Connecting microphone"
                          : isListening
                            ? "Stop voice input"
                            : "Voice input"
                    }
                  >
                    {isConnecting || isPolishing ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : isListening ? (
                      <IconPlayerStop size={14} />
                    ) : (
                      <IconMicrophone size={14} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isPolishing
                    ? "Polishing…"
                    : isConnecting
                      ? "Connecting…"
                      : isListening
                        ? "Stop recording"
                        : "Voice input"}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <PriorityPicker
              value={priority}
              onChange={setPriority}
              className={QUICK_TASK_OPTION_BADGE_CLASS}
            />

            <AssigneeSelector
              users={users}
              assignedTo={assignedTo}
              setAssignedTo={setAssignedTo}
            />

            <ModelSelectWithTraits
              value={model}
              options={modelOptions}
              onValueChange={(next) => {
                setModel(next);
                setProviderAccountId(
                  providerAccountIdForModel(accounts, providerAccountId, next),
                );
              }}
              accounts={accounts}
              accountId={providerAccountId}
              onAccountChange={setProviderAccountId}
              traits={traits}
              onTraitsChange={(partial) =>
                setTraits((prev) => ({ ...prev, ...partial }))
              }
              className={QUICK_TASK_OPTION_BADGE_CLASS}
            />

            {branchLockedToProject ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={QUICK_TASK_OPTION_BADGE_CLASS}
                  >
                    <IconGitBranch size={14} />
                    <span className="text-foreground">{displayBaseBranch}</span>
                    <IconInfoCircle
                      size={12}
                      className="cursor-help text-muted-foreground"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Inherited from the project&apos;s base branch
                </TooltipContent>
              </Tooltip>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={QUICK_TASK_OPTION_BADGE_CLASS}
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
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={QUICK_TASK_OPTION_BADGE_CLASS}>
                  <IconTag size={14} />
                  {selectedTags.length > 0 ? (
                    <span className="text-foreground">
                      {selectedTags.length} tag
                      {selectedTags.length !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span>Tags</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-0">
                <Command>
                  <CommandInput
                    placeholder="Search or create tag..."
                    value={tagSearch}
                    onValueChange={setTagSearch}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === ",") &&
                        tagSearch.trim()
                      ) {
                        e.preventDefault();
                        addCustomTag(tagSearch);
                      }
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {tagSearch.trim() ? (
                        <button
                          type="button"
                          className="w-full px-2 py-1.5 text-sm text-left hover:bg-muted rounded-sm"
                          onClick={() => addCustomTag(tagSearch)}
                        >
                          Create &quot;{tagSearch.trim()}&quot;
                        </button>
                      ) : (
                        "No tags"
                      )}
                    </CommandEmpty>
                    <CommandGroup>
                      {(() => {
                        const selected = new Set(selectedTags);
                        return (allTags ?? []).map((tag) => (
                          <CommandItem
                            key={tag}
                            value={tag}
                            onSelect={() => toggleTag(tag)}
                          >
                            <IconTag
                              size={14}
                              className="text-muted-foreground"
                            />
                            {tag}
                            {selected.has(tag) && (
                              <IconCheck size={14} className="ml-auto" />
                            )}
                          </CommandItem>
                        ));
                      })()}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 ml-1">
                {selectedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] h-8 gap-0.5 pr-0.5 sm:h-5"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      className="ml-0.5 rounded-sm px-0.5 opacity-50 transition-opacity hover:opacity-100 max-sm:flex max-sm:h-full max-sm:min-w-6 max-sm:items-center max-sm:justify-center max-sm:px-1"
                      onClick={() => toggleTag(tag)}
                    >
                      <IconX size={10} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <ProjectPicker
              projects={projects}
              selectedProjectId={selectedProjectId}
              setSelectedProjectId={setSelectedProjectId}
              open={projectPickerOpen}
              setOpen={setProjectPickerOpen}
              onCreateProject={() => setIsCreatingProject(true)}
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:justify-between">
            <div>
              {drafts && drafts.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <IconFileText size={16} />
                      Drafts ({drafts.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-sm font-medium">Saved Drafts</p>
                    </div>
                    <div className="scrollbar max-h-56 overflow-y-auto">
                      {drafts.map((draft) => (
                        <div key={draft._id}>
                          {confirmDeleteId === draft._id ? (
                            <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-destructive/5">
                              <span className="text-destructive truncate">
                                Delete draft?
                              </span>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => handleDeleteDraft(draft._id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // A row with its own delete control cannot be one
                            // big `<button>`, and `role="button"` on a div
                            // means hand-rolled key handling — so this follows
                            // `<ListRow>`: a stretched native button supplies
                            // the role and the keyboard, and the delete control
                            // sits above it.
                            <div className="group relative flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                              <button
                                type="button"
                                className="absolute inset-0 z-1 cursor-pointer focus-visible:outline-hidden"
                                aria-label={`Load draft ${draft.title || "Untitled"}`}
                                onClick={() => loadDraft(draft)}
                              />
                              <span className="flex-1 truncate">
                                {draft.title || (
                                  <span className="text-muted-foreground italic">
                                    Untitled
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                aria-label={`Delete draft ${draft.title || "Untitled"}`}
                                title={skipConfirmTitle("Delete draft")}
                                className="reveal-on-hover max-sm:hit-target relative z-2 shrink-0 rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() =>
                                  requestConfirm(
                                    altHeld,
                                    () => setConfirmDeleteId(draft._id),
                                    () => {
                                      void handleDeleteDraft(draft._id);
                                    },
                                  )
                                }
                              >
                                <IconTrash size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {isLoading && <Spinner size="sm" />}
                Create Task
                <ShortcutKbd
                  id="submitComposerForm"
                  className="ml-1.5 border-0 bg-transparent p-0 text-current opacity-60"
                />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <NewProjectModal
        isOpen={isCreatingProject}
        onClose={() => setIsCreatingProject(false)}
        onCreated={(id) => setSelectedProjectId(id)}
        defaultSkipPlanning
      />
    </>
  );
}
