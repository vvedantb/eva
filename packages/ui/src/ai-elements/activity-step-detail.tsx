"use client";

import { Badge } from "../ui/badge";
import { cn } from "../utils/cn";
import type { ActivityStep } from "./activity-shared";
import { CodeBlock, CodeBlockCopyButton } from "./code-block";
import { TaskItemFile } from "./task";

function basename(value: string): string {
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slash >= 0 ? value.slice(slash + 1) : value;
}

/**
 * Expandable body for a tool-call row: shell transcript, exit chip, edits,
 * file chips, and write preview. Presentational only.
 */
export function ActivityStepDetail({
  step,
  onOpenFile,
}: {
  step: ActivityStep;
  onOpenFile?: (path: string) => void;
}) {
  const command =
    step.command ?? (step.type === "bash" ? step.detail : undefined);
  const transcript =
    command || step.output
      ? [command ? `$ ${command}` : null, step.output?.text ?? null]
          .filter((part): part is string => Boolean(part))
          .join("\n\n")
      : "";

  // The transcript query strips output/edits/preview; until the full payload
  // lands there is genuinely nothing to show but the command that produced it.
  const awaitingDetail =
    step.hasHiddenDetail === true &&
    !step.output &&
    !step.edits?.length &&
    !step.contentPreview;

  return (
    <div
      className={cn("space-y-2 text-xs", step.isError && "text-destructive")}
    >
      {awaitingDetail ? (
        <p className="text-muted-foreground">Loading output...</p>
      ) : null}
      {(step.output?.exitCode !== undefined || step.output?.truncated) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {step.output.exitCode !== undefined ? (
            <Badge
              variant={step.output.exitCode === 0 ? "secondary" : "destructive"}
            >
              Exit code {step.output.exitCode}
            </Badge>
          ) : null}
          {step.output.truncated ? (
            <Badge variant="outline">Truncated</Badge>
          ) : null}
        </div>
      )}

      {transcript ? (
        <CodeBlock code={transcript} language="shell" className="text-xs">
          <CodeBlockCopyButton />
          <pre className="overflow-x-auto p-3 text-xs">
            <code>{transcript}</code>
          </pre>
        </CodeBlock>
      ) : null}

      {step.edits && step.edits.length > 0 ? (
        <div className="space-y-2">
          {step.edits.map((edit, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-md border border-border"
            >
              <pre className="overflow-x-auto bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap">
                {edit.oldText}
              </pre>
              <pre className="overflow-x-auto bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap">
                {edit.newText}
              </pre>
            </div>
          ))}
        </div>
      ) : null}

      {step.files && step.files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {step.files.map((filePath) =>
            onOpenFile ? (
              <button
                key={filePath}
                type="button"
                title={filePath}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenFile(filePath);
                }}
                className="inline-flex min-w-0 max-w-full cursor-pointer"
              >
                <TaskItemFile className="transition-colors hover:bg-muted">
                  {basename(filePath)}
                </TaskItemFile>
              </button>
            ) : (
              <TaskItemFile key={filePath}>{basename(filePath)}</TaskItemFile>
            ),
          )}
        </div>
      ) : null}

      {step.contentPreview ? (
        <CodeBlock
          code={step.contentPreview}
          language="text"
          className="text-xs"
        >
          <CodeBlockCopyButton />
          <pre className="overflow-x-auto p-3 text-xs">
            <code>{step.contentPreview}</code>
          </pre>
        </CodeBlock>
      ) : null}
    </div>
  );
}
