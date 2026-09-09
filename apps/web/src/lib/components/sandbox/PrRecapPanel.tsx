"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction } from "convex/react";
import {
  api,
  DEFAULT_AI_MODEL,
  INCOMPLETE_PR_RECAP_MESSAGE,
  isIncompleteReadyRecap,
  isViewableRecap,
  normalizeAIModel,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import {
  convexErrorPresentation,
  errorToneClassName,
  type ConvexErrorPresentation,
} from "@/lib/utils/convexErrorMessage";
import {
  ActivityTasks,
  Spinner,
  Surface,
  Tabs,
  TabsBar,
  TabsList,
  TabsTrigger,
} from "@eva/ui";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconGitPullRequest,
} from "@tabler/icons-react";
import { Streamdown } from "streamdown";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { HtmlPreviewFrame } from "@/lib/components/docs/_components/HtmlPreviewFrame";
import { RecapGenerateControls } from "@/lib/components/sandbox/_components/RecapGenerateControls";
import { RecapRunBadge } from "@/lib/components/sandbox/_components/RecapRunBadge";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { storedRunTraits, toRunTraitArgs } from "@/lib/utils/runTraits";

type RecapDoc = FunctionReturnType<typeof api.docs.getRecapByPrUrl>;

interface PrRecapPanelProps {
  prUrl?: string;
  repoId: Id<"githubRepos">;
  recapDoc: RecapDoc | undefined;
}

/**
 * Recap sub-tab for the sandbox PR panel — generate/stream/ready states for
 * Eva-origin (and any) PR recaps keyed by prUrl.
 */
export function PrRecapPanel({ prUrl, repoId, recapDoc }: PrRecapPanelProps) {
  const { basePath, repo } = useRepo();
  const generatePrRecap = useAction(api.docs.generatePrRecap);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] =
    useState<ConvexErrorPresentation | null>(null);
  const [view, setView] = useState<"recap" | "summary">("recap");
  // Only the pending override lives in state; the last run's setup is read off
  // the recap doc, so a reload shows what actually produced the recap.
  const [pendingModel, setPendingModel] = useState<AIModel>();
  const [pendingTraits, setPendingTraits] = useState<StoredModelTraits>();

  const model = normalizeAIModel(
    pendingModel ??
      recapDoc?.prRecapModel ??
      repo.defaultModel ??
      DEFAULT_AI_MODEL,
  );
  const traits = pendingTraits ?? storedRunTraits(recapDoc);

  const streamingEntityId =
    recapDoc !== null && recapDoc !== undefined
      ? `pr-recap:${recapDoc._id}`
      : "";
  const streaming = useQuery(
    api.streaming.get,
    streamingEntityId ? { entityId: streamingEntityId } : "skip",
  );
  const streamingSteps = parseActivitySteps(streaming?.currentActivity);

  const handleGenerate = async () => {
    if (!prUrl) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      await generatePrRecap({
        repoId,
        prUrl,
        model,
        ...toRunTraitArgs(traits),
      });
    } catch (error) {
      setGenerateError(
        convexErrorPresentation(error, "Couldn't generate recap"),
      );
    }
    setIsGenerating(false);
  };

  if (!prUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-1">
          <p className="text-sm font-medium">No pull request yet</p>
          <p className="text-sm text-muted-foreground">
            Once a pull request is opened for this work, its recap will appear
            here.
          </p>
        </div>
      </div>
    );
  }

  if (recapDoc === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (recapDoc === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconGitPullRequest className="h-10 w-10 text-muted-foreground/60" />
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium">No recap yet</p>
          <p className="text-sm text-muted-foreground">
            Generate a recap of this pull request for reviewers.
          </p>
          {generateError ? (
            <p className={`text-sm ${errorToneClassName(generateError.tone)}`}>
              {generateError.message}
            </p>
          ) : null}
          <RecapGenerateControls
            repoId={repoId}
            model={model}
            onModelChange={setPendingModel}
            traits={traits}
            onTraitsChange={(partial) =>
              setPendingTraits({ ...traits, ...partial })
            }
            onGenerate={() => {
              void handleGenerate();
            }}
            isGenerating={isGenerating}
            label={isGenerating ? "Generating…" : "Generate recap"}
          />
        </div>
      </div>
    );
  }

  const isPending = recapDoc.prRecapStatus === "pending";
  const isErrored = recapDoc.prRecapStatus === "error";
  // Pending with no workflow behind it means the run died: show the failure and
  // re-enable Generate instead of spinning on a stale activity trail forever.
  const isStalled = isPending && recapDoc.activeWorkflowId === undefined;
  // Older runs stored progress text as "ready" with no HTML walkthrough. The
  // write path rejects that now; the shared helper keeps this view and the docs
  // one reading those rows the same way.
  const isIncompleteReady = isIncompleteReadyRecap(recapDoc);
  const docPath = entityPathSegment(recapDoc);
  const shortSha =
    recapDoc.headSha !== undefined ? recapDoc.headSha.slice(0, 7) : null;

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (value === "recap" || value === "summary") setView(value);
      }}
      className="flex h-full min-h-0 flex-col"
    >
      <TabsBar
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {shortSha ? <span className="font-mono">{shortSha}</span> : null}
            {recapDoc.prRecapModel !== undefined ? (
              <RecapRunBadge
                model={normalizeAIModel(recapDoc.prRecapModel)}
                traits={storedRunTraits(recapDoc)}
              />
            ) : null}
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              View on GitHub
              <IconExternalLink size={12} />
            </a>
            {recapDoc.prNumber !== undefined ? (
              <DynamicLink
                to={toInternalRepoHref(
                  `${basePath}/reviews/${recapDoc.prNumber}/recap`,
                )}
                className="hover:text-foreground"
              >
                Open in Reviews
              </DynamicLink>
            ) : docPath ? (
              <DynamicLink
                to={toInternalRepoHref(`${basePath}/docs/${docPath}/recap`)}
                className="hover:text-foreground"
              >
                Open in Documents
              </DynamicLink>
            ) : null}
            <RecapGenerateControls
              repoId={repoId}
              model={model}
              onModelChange={setPendingModel}
              traits={traits}
              onTraitsChange={(partial) =>
                setPendingTraits({ ...traits, ...partial })
              }
              onGenerate={() => {
                void handleGenerate();
              }}
              isGenerating={isGenerating}
              disabled={isPending && !isStalled}
              variant="ghost"
              label={isViewableRecap(recapDoc) ? "Regenerate" : "Generate"}
            />
          </div>
        }
      >
        <TabsList>
          <TabsTrigger value="recap">Recap</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>
      </TabsBar>

      {isErrored || isStalled || isIncompleteReady ? (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {isStalled
                ? "Recap stopped"
                : isIncompleteReady
                  ? "Recap incomplete"
                  : "Recap failed"}
            </p>
            <p className="text-destructive/80">
              {isStalled
                ? "Generation stopped before it finished. Generate again to retry."
                : isIncompleteReady
                  ? INCOMPLETE_PR_RECAP_MESSAGE
                  : (recapDoc.prRecapError ??
                    "Something went wrong generating the recap.")}
            </p>
          </div>
        </div>
      ) : null}

      {isPending && !isStalled && (
        <div className="shrink-0 px-3 py-2">
          <Surface density="tight" className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner size="sm" />
              <span className="flex-1">Generating recap...</span>
            </div>
            {streamingSteps ? (
              <ActivityTasks steps={streamingSteps} isStreaming />
            ) : (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                {streaming?.currentActivity ?? "Generating recap..."}
              </p>
            )}
          </Surface>
        </div>
      )}

      {generateError ? (
        <p
          className={`px-3 py-1 text-sm ${errorToneClassName(generateError.tone)}`}
        >
          {generateError.message}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {view === "recap" ? (
          recapDoc.html ? (
            <HtmlPreviewFrame html={recapDoc.html} title="PR recap" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {isIncompleteReady || isErrored
                ? INCOMPLETE_PR_RECAP_MESSAGE
                : "No recap yet. It is created the next time this review runs."}
            </p>
          )
        ) : (
          <Surface>
            <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {recapDoc.content}
            </Streamdown>
          </Surface>
        )}
      </div>
    </Tabs>
  );
}
