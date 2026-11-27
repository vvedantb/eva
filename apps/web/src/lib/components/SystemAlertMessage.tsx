"use client";

import { useState } from "react";
import { m } from "motion/react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  tokenTransition,
  RelativeDateTime,
} from "@vvedantb/ui";
import { IconAlertCircle, IconAlertTriangle } from "@tabler/icons-react";
import { cn } from "@eva/ui";

interface SystemAlertMessageProps {
  content: string;
  errorDetail?: string;
  /** "warning": the session kept running. Unset with detail: an error. */
  alertTone?: "warning";
  timestamp?: number;
}

/** Warning and error alerts get an icon and colour; plain dividers get none. */
const TONES = {
  warning: {
    Icon: IconAlertTriangle,
    color: "text-warning",
    action: "View details",
    title: "Sandbox Warning",
  },
  error: {
    Icon: IconAlertCircle,
    color: "text-destructive",
    action: "View error",
    title: "Sandbox Error",
  },
};

export function SystemAlertMessage({
  content,
  errorDetail,
  alertTone,
  timestamp,
}: SystemAlertMessageProps) {
  const [showError, setShowError] = useState(false);
  const tone =
    alertTone === "warning"
      ? TONES.warning
      : errorDetail
        ? TONES.error
        : undefined;

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={tokenTransition.base}
        className="flex items-center gap-3 py-1"
      >
        <div className="h-px flex-1 bg-border" />
        {tone && (
          <tone.Icon
            size={14}
            aria-hidden
            className={cn("-mr-1.5 shrink-0", tone.color)}
          />
        )}
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap max-w-[60%] truncate sm:max-w-none sm:truncate-none">
          {content}
          {timestamp !== undefined ? (
            <>
              <span className="ml-1.5 text-muted-foreground/70 font-normal">
                ·
              </span>
              <RelativeDateTime
                at={timestamp}
                className="ml-1 text-muted-foreground/70 font-normal"
              />
            </>
          ) : null}
        </span>
        {errorDetail && tone && (
          <button
            type="button"
            onClick={() => setShowError(true)}
            className={cn(
              "max-sm:hit-target text-xs font-medium hover:underline whitespace-nowrap",
              tone.color,
            )}
          >
            {tone.action}
          </button>
        )}
        <div className="h-px flex-1 bg-border" />
      </m.div>
      {errorDetail && tone && (
        <Dialog open={showError} onOpenChange={setShowError}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <tone.Icon size={16} className={tone.color} />
                {tone.title}
              </DialogTitle>
            </DialogHeader>
            <pre className="whitespace-pre-wrap max-sm:wrap-break-word text-sm text-muted-foreground bg-muted rounded-surface p-4 max-h-[min(16rem,50dvh)] overflow-y-auto scroll-fade">
              {errorDetail}
            </pre>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowError(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
