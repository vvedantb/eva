"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Link } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@eva/ui";
import { IconAlertTriangle, IconFileText } from "@tabler/icons-react";
import { compactRelativeTime } from "@eva/shared/dates";
import { useQueryState } from "nuqs";
import { branchParser } from "@/lib/search-params";
import { ContextSidebarHeaderIconButton } from "@/lib/components/sidebar/ContextSidebarHeaderAction";
import {
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClass,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { SidebarListHoverCard } from "@/lib/components/sidebar/SidebarListHoverCard";
import { entityPathSegment } from "@/lib/numId";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";

interface TestingArenaSidebarProps {
  repoId: Id<"githubRepos">;
  basePath: string;
  pathname: string;
  onNavigate?: () => void;
  createRequestId?: number;
}

export function TestingArenaSidebar({
  repoId,
  basePath,
  pathname,
  onNavigate,
  createRequestId,
}: TestingArenaSidebarProps) {
  const docs = useQuery(api.docs.list, { repoId });
  const startEvaluation = useMutation(api.evaluationWorkflow.startEvaluation);

  const [branch] = useQueryState("branch", branchParser);
  const [showTestAllModal, setShowTestAllModal] = useState(false);
  const altHeld = useAltHeld();
  const [isTestingAll, setIsTestingAll] = useState(false);
  const lastCreateRequestIdRef = useRef(createRequestId ?? 0);

  useEffect(() => {
    if (createRequestId === undefined) return;
    if (createRequestId <= lastCreateRequestIdRef.current) return;
    lastCreateRequestIdRef.current = createRequestId;
    setShowTestAllModal(true);
  }, [createRequestId]);

  // Only docs with content can be evaluated; the rest are skipped.
  const testableDocs = (docs ?? []).filter((d) => d.hasContent);

  const handleTestAll = async () => {
    setShowTestAllModal(false);
    if (testableDocs.length === 0) return;
    setIsTestingAll(true);
    try {
      // Fire all evaluations; one failure must not abort the batch.
      await Promise.allSettled(
        testableDocs.map((doc) =>
          startEvaluation({
            docId: doc._id,
            repoId,
            branchName: branch !== "main" ? branch : undefined,
          }),
        ),
      );
      mutationSuccess("Tests started", "testing-arena-run-all");
    } catch {
      mutationError("Couldn't start tests", "testing-arena-run-all");
      setIsTestingAll(false);
      return;
    }
    setIsTestingAll(false);
  };

  return (
    <>
      <ContextSidebarHeaderIconButton
        title={skipConfirmTitle("Test all documents")}
        icon={IconAlertTriangle}
        className="text-warning"
        onClick={() =>
          requestConfirm(
            altHeld,
            () => setShowTestAllModal(true),
            () => {
              void handleTestAll();
            },
          )
        }
      />

      <div className="flex-1">
        {docs === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : docs.length === 0 ? (
          <div className="p-4 text-center">
            <IconFileText
              size={28}
              className="mx-auto mb-2 text-muted-foreground"
            />
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create docs to test against
            </p>
          </div>
        ) : (
          <SharedLayoutNav layoutId="testing-arena-nav" className="space-y-1">
            {docs.map((doc, index) => {
              const segment = entityPathSegment(doc);
              if (!segment) return null;
              const href = `${basePath}/testing-arena/${segment}`;
              const isSelected = pathname.startsWith(href);
              return (
                <ListEnter key={doc._id} index={index} fast>
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
                        onClick={onNavigate}
                        className={sidebarNavLinkClass(isSelected)}
                      >
                        <IconFileText
                          size={16}
                          className={cn(
                            "shrink-0",
                            isSelected
                              ? "text-sidebar-primary"
                              : "text-muted-foreground",
                          )}
                        />
                        <MarqueeOnHover className="min-w-0 flex-1">
                          {doc.title}
                        </MarqueeOnHover>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {compactRelativeTime(doc.updatedAt)}
                        </span>
                      </Link>
                    </SidebarListHoverCard>
                  </SharedLayoutNavSurface>
                </ListEnter>
              );
            })}
          </SharedLayoutNav>
        )}
      </div>

      <Dialog
        open={showTestAllModal}
        onOpenChange={(v) => {
          if (!v) setShowTestAllModal(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test all documents</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Run a code evaluation for each of the {testableDocs.length} document
            {testableDocs.length === 1 ? "" : "s"} with content?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Each runs against your codebase sequentially. Empty documents are
            skipped.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowTestAllModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTestAll}
              disabled={isTestingAll || testableDocs.length === 0}
            >
              {isTestingAll ? <Spinner size="sm" /> : "Run all tests"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
