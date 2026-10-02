"use client";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from "@eva/ui";
import type { ThemeTypes } from "@pierre/diffs";
import {
  IconArrowsDiagonal,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconMessage,
} from "@tabler/icons-react";
import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { DiffView } from "@/lib/search-params";
import { toSandboxFilePath } from "@/lib/components/chat/ChangedFilesCard";
import { useOpenSandboxFile } from "@/lib/contexts/OpenSandboxFileContext";
import { usePendingReviewComments } from "@/lib/contexts/PendingReviewCommentsContext";
import { DiffCountBar, FileStatusChip } from "./DiffFileBadges";
import { DiffFileLazyBody } from "./DiffFileLazyBody";
import type { DiffFileEntry } from "./diffFiles";
import {
  ReviewableFileDiff,
  type FullFileContents,
} from "./ReviewableFileDiff";

interface DiffFileAccordionItemProps {
  entry: DiffFileEntry;
  diffView: DiffView;
  resolvedTheme: ThemeTypes;
  viewed: boolean;
  onViewedChange: (viewed: boolean) => void;
  wrapLines: boolean;
  repoId: Id<"githubRepos">;
  /** Commits the diff was taken between — needed to read whole file contents. */
  baseSha: string;
  headSha: string;
  /** `https://github.com/<owner>/<name>`, for the "View file" link. */
  repoUrl: string;
  /** Scrolling ancestor, so the diff body can defer until it is near view. */
  scrollRoot: Element | null;
  /** Skip deferral for the file being scrolled to. */
  eager: boolean;
}

type FullFileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable"; reason: "too-large" | "binary" }
  | { status: "ready"; fullFile: FullFileContents };

const UNAVAILABLE_LABEL: Record<"too-large" | "binary", string> = {
  "too-large": "File is too large to load in full.",
  binary: "File is binary, so it cannot be expanded.",
};

/**
 * One collapsible file in the Diffs list. The header mirrors GitHub's file bar:
 * status chip, change counts, pending-comment count, a per-file menu, and a
 * Viewed checkbox (the parent also collapses/expands on toggle, as GitHub does).
 * It sticks to the top of the scroll area while its diff is on screen.
 */
export function DiffFileAccordionItem({
  entry,
  diffView,
  resolvedTheme,
  viewed,
  onViewedChange,
  wrapLines,
  repoId,
  baseSha,
  headSha,
  repoUrl,
  scrollRoot,
  eager,
}: DiffFileAccordionItemProps) {
  const { path, patch, status, additions, deletions, renamedFrom } = entry;
  const getPrFileContents = useAction(api.github.getPrFileContents);
  const review = usePendingReviewComments();
  const openSandboxFile = useOpenSandboxFile();
  const openInFiles = openSandboxFile
    ? () => openSandboxFile(toSandboxFilePath(path))
    : undefined;
  const [fullFile, setFullFile] = useState<FullFileState>({ status: "idle" });

  const pendingComments =
    review?.comments.filter((comment) => comment.filePath === path).length ?? 0;

  const fileName = path.includes("/")
    ? path.slice(path.lastIndexOf("/") + 1)
    : path;
  const dirPath = path.includes("/")
    ? path.slice(0, path.lastIndexOf("/"))
    : null;

  /**
   * Pulls both ends of the file so the diff can be re-derived from whole files.
   * That is the only way to offer GitHub's "expand unchanged lines": the PR
   * patch itself only carries a few lines of context around each hunk.
   */
  const loadFullFile = () => {
    setFullFile({ status: "loading" });
    getPrFileContents({ repoId, path, baseSha, headSha })
      .then((res) => {
        if (res.skipped !== null) {
          setFullFile({ status: "unavailable", reason: res.skipped });
          return;
        }
        setFullFile({
          status: "ready",
          fullFile: {
            oldContents: res.oldContents ?? "",
            newContents: res.newContents ?? "",
          },
        });
      })
      .catch(() => setFullFile({ status: "error" }));
  };

  const canExpandContext =
    entry.hasHunks && !entry.binary && fullFile.status !== "ready";

  return (
    // AccordionItem defaults to `last:border-b-0`; keep `last:border-b` so the
    // final card still has a full hairline outline.
    <AccordionItem
      value={path}
      className="rounded-md border border-border bg-card last:border-b"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-md border-b border-border bg-muted/95 px-2 backdrop-blur-sm">
        <AccordionTrigger className="min-w-0 flex-1 py-2 hover:no-underline">
          <span className="mr-2 flex min-w-0 flex-1 items-baseline gap-1.5 text-left font-mono text-xs">
            {renamedFrom ? (
              <span
                className="truncate text-muted-foreground line-through"
                title={renamedFrom}
              >
                {renamedFrom}
              </span>
            ) : null}
            {renamedFrom ? <span className="shrink-0">→</span> : null}
            {dirPath ? (
              <span className="truncate text-muted-foreground" title={path}>
                {dirPath}/
              </span>
            ) : null}
            <span className="shrink-0 font-medium text-foreground">
              {fileName}
            </span>
          </span>
        </AccordionTrigger>

        <div className="flex shrink-0 items-center gap-2 py-1.5">
          <FileStatusChip status={status} />
          {pendingComments > 0 ? (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={`${pendingComments} pending comment(s)`}
            >
              <IconMessage className="size-3.5" />
              {pendingComments}
            </span>
          ) : null}
          {entry.binary ? null : (
            <DiffCountBar additions={additions} deletions={deletions} />
          )}

          {openInFiles ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Open ${fileName} in Files`}
              data-testid="open-in-files"
              onClick={(event) => {
                event.stopPropagation();
                openInFiles();
              }}
            >
              <IconFileText className="size-4" />
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="File actions">
                <IconDots className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canExpandContext ? (
                <DropdownMenuItem
                  onSelect={loadFullFile}
                  disabled={fullFile.status === "loading"}
                >
                  <IconArrowsDiagonal className="size-4" />
                  {fullFile.status === "error"
                    ? "Retry loading full file"
                    : "Load full file context"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => void navigator.clipboard.writeText(path)}
              >
                <IconCopy className="size-4" />
                Copy path
              </DropdownMenuItem>
              {openInFiles ? (
                <DropdownMenuItem onSelect={openInFiles}>
                  <IconFileText className="size-4" />
                  Open in Files
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={`${repoUrl}/blob/${headSha}/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconExternalLink className="size-4" />
                  View file on GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <label
            className="flex cursor-pointer items-center gap-1.5 pr-1 text-xs text-muted-foreground hover:text-foreground"
            // Keep the checkbox out of the accordion trigger so checking Viewed
            // does not fight the expand/collapse control.
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={viewed}
              onCheckedChange={(checked) => onViewedChange(checked === true)}
              aria-label={`Mark ${path} as viewed`}
            />
            {/* The checkbox carries the accessible name, so the word can go on a
                phone and give the file path back its width. */}
            <span className="hidden sm:inline">Viewed</span>
          </label>
        </div>
      </div>

      <AccordionContent className="pb-0">
        {entry.binary ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Binary file not shown.
          </p>
        ) : !entry.hasHunks ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {renamedFrom
              ? "File renamed without content changes."
              : "No content changes in this file."}
          </p>
        ) : (
          <>
            {fullFile.status === "loading" ? (
              <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                Loading full file…
              </p>
            ) : null}
            {fullFile.status === "error" ? (
              <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                Could not load the full file.
              </p>
            ) : null}
            {fullFile.status === "unavailable" ? (
              <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                {UNAVAILABLE_LABEL[fullFile.reason]}
              </p>
            ) : null}
            <DiffFileLazyBody
              additions={additions}
              deletions={deletions}
              contextLines={entry.contextLines}
              hunkCount={entry.hunkCount}
              diffView={diffView}
              scrollRoot={scrollRoot}
              eager={eager}
            >
              <ReviewableFileDiff
                patch={patch}
                path={path}
                diffView={diffView}
                resolvedTheme={resolvedTheme}
                hideFileHeader
                wrapLines={wrapLines}
                fullFile={
                  fullFile.status === "ready" ? fullFile.fullFile : undefined
                }
              />
            </DiffFileLazyBody>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
