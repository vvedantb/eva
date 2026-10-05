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
  IconChevronRight,
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
import { PrDiffStat } from "@/lib/components/reviews/_components/prReviewParts";
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
  /**
   * Commits the diff was taken between — needed to read whole file contents.
   * Null for a lone commit, whose parent the payload does not carry.
   */
  refs: { baseSha: string; headSha: string } | null;
  /** `https://github.com/<owner>/<name>`, for the "View file" link. */
  repoUrl: string;
  /** The ref the "View file" link opens the file at. */
  viewRef: string;
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
 * One collapsible file in the Code tab. The header mirrors GitHub's file bar:
 * the whole path, change counts, pending-comment count, a per-file menu, and a
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
  refs,
  repoUrl,
  viewRef,
  scrollRoot,
  eager,
}: DiffFileAccordionItemProps) {
  const { path, patch, additions, deletions, renamedFrom } = entry;
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

  /**
   * Pulls both ends of the file so the diff can be re-derived from whole files.
   * That is the only way to offer GitHub's "expand unchanged lines": the PR
   * patch itself only carries a few lines of context around each hunk.
   */
  const loadFullFile = () => {
    if (refs === null) return;
    setFullFile({ status: "loading" });
    getPrFileContents({ repoId, path, ...refs })
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
    refs !== null &&
    entry.hasHunks &&
    !entry.binary &&
    fullFile.status !== "ready";

  return (
    // A card per file, as Cursor's diff viewer draws it: rounded, a gap to the
    // next, and a header that reads the whole path at body size. The path
    // wraps rather than truncating — a cut-off name is the thing that made
    // this hard to read.
    <AccordionItem
      value={path}
      className="group/item overflow-clip rounded-xl border border-border bg-card last:border-b"
    >
      <div className="group/file sticky top-0 z-10 flex items-center gap-3 border-border bg-card/95 pr-3 pl-2 backdrop-blur-sm group-data-[state=open]/item:border-b">
        <AccordionTrigger className="min-w-0 flex-1 py-3 hover:no-underline [&>svg:last-child]:hidden">
          <span className="flex min-w-0 flex-1 items-start gap-2 text-left">
            <IconChevronRight
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)] group-data-[state=open]:rotate-90"
            />
            <span className="min-w-0 flex-1 text-sm font-normal break-words text-foreground">
              {renamedFrom ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {renamedFrom}
                  </span>
                  <span className="text-muted-foreground"> → </span>
                </>
              ) : null}
              <BreakablePath path={path} />
            </span>
          </span>
        </AccordionTrigger>

        <div className="flex shrink-0 items-center gap-2.5">
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
            <PrDiffStat additions={additions} deletions={deletions} className="text-sm" />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Actions for ${fileName}`}
                className="reveal-on-hover"
              >
                <IconDots />
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
                <DropdownMenuItem onSelect={openInFiles} data-testid="open-in-files">
                  <IconFileText className="size-4" />
                  Open in Files
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={`${repoUrl}/blob/${viewRef}/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconExternalLink className="size-4" />
                  View file on GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Outside the trigger so ticking Viewed does not also fold the
              file. The tick alone, as Cursor has it; the label names it. */}
          <span
            className="flex items-center"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={viewed}
              onCheckedChange={(checked) => onViewedChange(checked === true)}
              aria-label={`Mark ${path} as viewed`}
              title="Viewed"
              className="size-4.5 rounded-[5px]"
            />
          </span>
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

/**
 * A path that may wrap after any `/`, so a long one breaks between folders
 * instead of mid-name.
 */
function BreakablePath({ path }: { path: string }) {
  const parts = path.split("/");
  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </span>
  ));
}
