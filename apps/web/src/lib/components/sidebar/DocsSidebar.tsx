"use client";

import { useRef, useEffect, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation, useConvex } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Surface,
  Textarea,
} from "@eva/ui";
import {
  IconFile,
  IconMessage,
  IconPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { docSourceLabel, docSourceRoute } from "@/lib/components/docs/_source";
import { compactRelativeTime } from "@eva/shared/dates";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { ContextSidebarHeaderIconButton } from "@/lib/components/sidebar/ContextSidebarHeaderAction";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { SidebarListHoverCard } from "@/lib/components/sidebar/SidebarListHoverCard";
import { entityPathSegment, routeNumIdFromPath } from "@/lib/numId";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface DocsSidebarProps {
  repoId: Id<"githubRepos">;
  basePath: string;
  pathname: string;
  onNavigate?: () => void;
  createRequestId?: number;
}

export function DocsSidebar({
  repoId,
  basePath,
  pathname,
  onNavigate,
  createRequestId,
}: DocsSidebarProps) {
  const navigate = useNavigate();
  const convex = useConvex();
  const docs = useQuery(api.docs.list, {
    repoId,
    excludeEvaRecaps: true,
  });
  const createDoc = useMutation(api.docs.create);
  const removeDoc = useMutation(api.docs.remove).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.docs.list, {
        repoId,
        excludeEvaRecaps: true,
      });
      if (current !== undefined) {
        localStore.setQuery(
          api.docs.list,
          { repoId, excludeEvaRecaps: true },
          current.filter((d) => d._id !== args.id),
        );
      }
    },
  );
  const [docToDelete, setDocToDelete] = useState<{
    id: Id<"docs">;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const altHeld = useAltHeld();
  const [isUploading, setIsUploading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [pastedPrdContent, setPastedPrdContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCreateRequestIdRef = useRef(createRequestId ?? 0);

  useEffect(() => {
    if (createRequestId === undefined) return;
    if (createRequestId <= lastCreateRequestIdRef.current) return;
    lastCreateRequestIdRef.current = createRequestId;
    setIsCreateDialogOpen(true);
  }, [createRequestId]);

  // PR recaps live under Reviews now — Documents is non-recap only.
  const filteredDocs = docs
    ? docs.filter((doc) => doc.kind !== "pr-recap")
    : [];

  const handleCreateDoc = async () => {
    if (!newDocTitle.trim()) return;
    setIsCreating(true);
    try {
      const id = await createDoc({
        repoId,
        title: newDocTitle.trim(),
        content: "",
      });
      const created = await convex.query(api.docs.get, { id });
      // Guarded with ifs rather than a ternary, and onNavigate called through
      // an if rather than `?.`: React Compiler bails on the whole file when a
      // conditional, logical or optional-chaining expression sits inside a
      // try/catch.
      if (!created) {
        setIsCreating(false);
        return;
      }
      const segment = entityPathSegment(created);
      if (!segment) {
        setIsCreating(false);
        return;
      }
      setNewDocTitle("");
      setIsCreateDialogOpen(false);
      navigate({
        to: toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        ),
        search: (prev) => prev,
      });
      if (onNavigate) onNavigate();
      mutationSuccess("Document created", "doc-create");
    } catch {
      mutationError("Couldn't create document", "doc-create");
      setIsCreating(false);
      return;
    }
    setIsCreating(false);
  };

  const readFileContent = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Failed to read file content"));
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const getTitleFromContent = (content: string): string => {
    const firstLine = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!firstLine) return "Uploaded PRD";

    const normalized = firstLine.replace(/^#+\s*/, "");
    return normalized.slice(0, 80) || "Uploaded PRD";
  };

  const createDocFromPrd = async ({
    title,
    prdContent,
  }: {
    title: string;
    prdContent: string;
  }) => {
    setIsUploading(true);
    try {
      const id = await createDoc({ repoId, title, content: prdContent });
      const created = await convex.query(api.docs.get, { id });
      if (!created) {
        setIsUploading(false);
        return;
      }
      const segment = entityPathSegment(created);
      if (!segment) {
        setIsUploading(false);
        return;
      }
      setIsCreateDialogOpen(false);
      setShowUploadSection(false);
      setPastedPrdContent("");
      setNewDocTitle("");
      navigate({
        to: toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        ),
        search: (prev) => prev,
      });
      if (onNavigate) onNavigate();
      mutationSuccess("Document created", "doc-create");
    } catch (error) {
      console.error("PRD upload failed", error);
      mutationError("Couldn't create the document. Try again.", "doc-create");
    }
    setIsUploading(false);
  };

  const handleUploadSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const title = file.name.replace(/\.[^/.]+$/, "") || "Untitled";
    try {
      const prdContent = await readFileContent(file);
      await createDocFromPrd({ title, prdContent });
    } catch (error) {
      console.error("PRD upload failed", error);
      mutationError("Couldn't read that file. Pick a plain text file.", "doc-upload");
    }
  };

  const handlePasteUpload = async () => {
    const content = pastedPrdContent.trim();
    if (!content) return;
    const title = getTitleFromContent(content);
    await createDocFromPrd({
      title,
      prdContent: content,
    });
  };

  const handleDelete = async (
    target: { id: Id<"docs">; title: string } | null = docToDelete,
  ) => {
    if (!target) return;
    // Resolved before the try (it needs no await, and the guard above already
    // proves target): React Compiler bails on the whole file when a
    // conditional or logical expression sits inside a try/catch.
    const docToDeleteSegment = docs?.find((d) => d._id === target.id);
    const deletePathSegment = docToDeleteSegment
      ? entityPathSegment(docToDeleteSegment)
      : null;
    const isViewing =
      deletePathSegment !== null &&
      routeNumIdFromPath(pathname, `${basePath}/docs`) === deletePathSegment;
    setIsDeleting(true);
    try {
      await removeDoc({ id: target.id });
      mutationSuccess("Document deleted", "doc-delete");
      setDocToDelete(null);
      if (isViewing) {
        navigate({
          to: toInternalRepoHref(`${basePath}/docs`),
          search: (prev) => prev,
        });
        if (onNavigate) onNavigate();
      }
    } catch {
      mutationError("Couldn't delete document", "doc-delete");
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt"
        className="hidden"
        onChange={handleUploadSelect}
      />

      <ContextSidebarHeaderIconButton
        title="New document"
        icon={IconPlus}
        onClick={() => setIsCreateDialogOpen(true)}
      />

      <div className="flex-1">
        {docs === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <IconFile
              size={20}
              className="mx-auto mb-2 text-muted-foreground opacity-50"
            />
            <p className="text-sm font-medium text-foreground">No documents yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create one to get started.
            </p>
          </div>
        ) : (
          <SharedLayoutNav layoutId="docs-nav" className="space-y-1">
            {filteredDocs.map((doc) => {
              const segment = entityPathSegment(doc);
              if (!segment) return null;
              const href = `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`;
              const isSelected = pathname.startsWith(
                `${basePath}/docs/${segment}`,
              );
              return (
                <ContextMenu key={doc._id}>
                  <ContextMenuTrigger asChild>
                    <SharedLayoutNavSurface
                      itemId={doc._id}
                      isActive={isSelected}
                      className="group"
                    >
                      <SidebarListHoverCard
                        title={doc.title}
                        preview={doc.contentPreview}
                        createdAt={doc.createdAt}
                        userId={doc.createdBy}
                      >
                        <Link
                          to={href}
                          search={(prev) => prev}
                          onClick={onNavigate}
                          className={sidebarNavLinkClass(isSelected)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{doc.title}</span>
                            {doc.source ? (
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {docSourceLabel(doc.source)}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {compactRelativeTime(doc.updatedAt)}
                          </span>
                        </Link>
                      </SidebarListHoverCard>
                    </SharedLayoutNavSurface>
                  </ContextMenuTrigger>
                  <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                    {doc.source && docSourceRoute(doc.source) ? (
                      <ContextMenuItem
                        onClick={() => {
                          const route = docSourceRoute(doc.source);
                          if (!route) return;
                          void navigate({
                            to: route.to,
                            params: route.params,
                          });
                          if (onNavigate) onNavigate();
                        }}
                      >
                        <IconMessage size={16} />
                        Open{" "}
                        {doc.source.kind === "session"
                          ? "session"
                          : doc.source.kind === "task"
                            ? "task"
                            : "project"}
                      </ContextMenuItem>
                    ) : null}
                    {doc.kind !== "pr-recap" ? (
                      <ContextMenuItem
                        className="text-destructive"
                        title={skipConfirmTitle("Delete")}
                        onClick={() => {
                          const target = { id: doc._id, title: doc.title };
                          requestConfirm(
                            altHeld,
                            () => setDocToDelete(target),
                            () => {
                              void handleDelete(target);
                            },
                          );
                        }}
                      >
                        <IconTrash size={16} />
                        Delete
                        <ConfirmSkipHint />
                      </ContextMenuItem>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </SharedLayoutNav>
        )}
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (isUploading || isCreating) return;
          setIsCreateDialogOpen(open);
          if (!open) {
            setNewDocTitle("");
            setShowUploadSection(false);
            setPastedPrdContent("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          {showUploadSection ? (
            <div className="space-y-4">
              <Surface density="tight">
                <p className="text-sm font-medium">Upload a file</p>
                <p className="mb-3 text-sm text-muted-foreground">
                  Supported formats: .md, .txt
                </p>
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Spinner size="sm" />
                  ) : (
                    <IconUpload size={14} />
                  )}
                  Click to upload
                </Button>
              </Surface>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Paste PRD content</label>
                <Textarea
                  value={pastedPrdContent}
                  onChange={(event) => setPastedPrdContent(event.target.value)}
                  placeholder="Paste your PRD here..."
                  rows={8}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowUploadSection(false);
                    setPastedPrdContent("");
                  }}
                  disabled={isUploading}
                >
                  Back
                </Button>
                <Button
                  onClick={handlePasteUpload}
                  disabled={isUploading || pastedPrdContent.trim().length === 0}
                >
                  {isUploading && <Spinner size="sm" />}
                  Upload from paste
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                placeholder="e.g., User Authentication PRD"
                value={newDocTitle}
                onChange={(event) => setNewDocTitle(event.target.value)}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newDocTitle.trim()) {
                    void handleCreateDoc();
                  }
                }}
              />
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-control border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                onClick={() => setShowUploadSection(true)}
              >
                <IconUpload size={14} />
                Upload PRD instead
              </button>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setNewDocTitle("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateDoc}
                  disabled={isCreating || !newDocTitle.trim()}
                >
                  {isCreating ? <Spinner size="sm" /> : "Create Document"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!docToDelete}
        onOpenChange={(v) => {
          if (!v) setDocToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong>{docToDelete?.title}</strong>?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            This action cannot be undone. The document will be permanently
            deleted.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDocToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting && <Spinner size="sm" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
